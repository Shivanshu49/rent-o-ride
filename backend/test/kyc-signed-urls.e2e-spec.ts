/**
 * Signed URLs for KYC documents, against a real Supabase Storage.
 *
 * A signed URL is a bearer capability: whoever holds the string can read the
 * object. Two things therefore have to be true, and neither is provable by
 * reading the code.
 *
 *   1. It EXPIRES, and the storage server enforces that. A signed URL that
 *      never expires is a public URL with extra steps — it gets pasted into a
 *      support chat, logged by a proxy, kept in a browser history, and it keeps
 *      working. This one points at somebody's driving licence.
 *
 *   2. We only hand one out to the person whose document it is (or an admin).
 *      The check happens BEFORE minting, so a wrong-user request never causes a
 *      URL to exist at all.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BUCKETS, StorageService } from '../src/modules/storage/storage.service';
import { createTestApi, dropUsers, fixtureDb, needsSupabase, probeSupabase, seedUser, type TestApi } from './support/api';

let api: TestApi;
let storage: StorageService;
let ttl: number;

const planted: string[] = [];
const uploaded: string[] = [];

/** A document belonging to `owner`, uploaded for real. */
interface Document {
  id: string;
  path: string;
}

let ownerAuthId: string;
let ownerToken: string;
let strangerToken: string;
let adminToken: string;
let document: Document;

const bearer = (token: string): [string, string] => ['authorization', `Bearer ${token}`];
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Storage signs with a JWT carried in the query string, so the deadline can be
 *  read straight off the URL without waiting for it. */
const expiryOf = (url: string): number => {
  const token = new URL(url, 'http://placeholder').searchParams.get('token')!;
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()).exp as number;
};

beforeAll(async () => {
  // Signed URLs are minted and enforced by Supabase Storage. There is no
  // version of this suite worth running without it.
  if (!(await probeSupabase())) return;

  api = await createTestApi();
  storage = api.app.get(StorageService);
  ttl = api.config.get('KYC_SIGNED_URL_TTL_SECONDS');

  const owner = await seedUser({ kycStatus: 'PENDING' });
  const stranger = await seedUser();
  const admin = await seedUser({ role: 'ADMIN' });
  planted.push(owner.authUserId, stranger.authUserId, admin.authUserId);

  ownerAuthId = owner.authUserId;
  ownerToken = await api.mint({ sub: owner.authUserId });
  strangerToken = await api.mint({ sub: stranger.authUserId });
  adminToken = await api.mint({ sub: admin.authUserId });

  const created = await request(api.server)
    .post('/kyc/documents')
    .set(...bearer(ownerToken))
    .send({ docType: 'DRIVING_LICENCE', contentType: 'image/png' });

  expect(created.status, JSON.stringify(created.body)).toBe(201);
  document = { id: created.body.documentId, path: created.body.path };
  uploaded.push(document.path);

  // Put real bytes behind it, so a read either returns them or genuinely fails.
  const put = await fetch(created.body.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: Buffer.from('89504e470d0a1a0a', 'hex'),
  });
  expect(put.status).toBe(200);
});

afterAll(async () => {
  if (!api) return;
  await storage.remove(BUCKETS.kyc, uploaded);
  await dropUsers(planted);
  await api.close();
});

describe('minting', () => {
  it('namespaces the path under the owner, not under anything the client sent', (ctx) => {
    needsSupabase(ctx);
    // A client-chosen path could be written into somebody else's folder. The
    // shape is <our users.id>/<doctype>-<uuid>.<ext>, all of it server-decided;
    // nothing the request carried appears in it.
    expect(document.path).toMatch(/^[0-9a-f-]{36}\/driving_licence-[0-9a-f-]{36}\.png$/);
  });

  it('never returns the storage path to the client when listing', async (ctx) => {
    needsSupabase(ctx);
    const response = await request(api.server)
      .get('/kyc/documents')
      .set(...bearer(ownerToken));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).not.toHaveProperty('storagePath');
    expect(JSON.stringify(response.body)).not.toContain(document.path);
  });
});

describe('a read URL expires', () => {
  it('works right now', async (ctx) => {
    needsSupabase(ctx);
    const response = await request(api.server)
      .get(`/kyc/documents/${document.id}`)
      .set(...bearer(ownerToken));

    expect(response.status).toBe(200);
    expect(response.body.expiresInSeconds).toBe(ttl);

    const fetched = await fetch(response.body.url);
    expect(fetched.status).toBe(200);
  });

  it('carries a deadline of exactly the configured TTL', async (ctx) => {
    needsSupabase(ctx);
    const response = await request(api.server)
      .get(`/kyc/documents/${document.id}`)
      .set(...bearer(ownerToken));

    const secondsLeft = expiryOf(response.body.url) - Math.floor(Date.now() / 1000);
    expect(secondsLeft).toBeGreaterThan(0);
    expect(secondsLeft).toBeLessThanOrEqual(ttl + 2);
    // 60 seconds is the configured value. The assertion that matters is that
    // it is SHORT — a URL good for a day is as good as a public one.
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it('is refused by storage once the deadline has passed', async (ctx) => {
    needsSupabase(ctx);
    // The TTL is not caller-controllable through the API, so the only way to
    // watch one expire without waiting a minute is to mint a 1-second URL here
    // and prove the SERVER enforces it rather than trusting the claim.
    const url = await storage.createSignedRead(BUCKETS.kyc, document.path, 1);
    expect((await fetch(url)).status).toBe(200);

    await sleep(2_000);

    const afterExpiry = await fetch(url);
    expect(afterExpiry.status).not.toBe(200);
    expect(afterExpiry.status).toBe(400);
  });

  it('has no request field that could lengthen it', async (ctx) => {
    needsSupabase(ctx);
    // Zod strips unknown keys, so an attacker cannot ask for a longer-lived URL.
    const response = await request(api.server)
      .get(`/kyc/documents/${document.id}?expiresIn=86400`)
      .set(...bearer(ownerToken))
      .send({ expiresIn: 86_400, expiresInSeconds: 86_400 });

    expect(response.body.expiresInSeconds).toBe(ttl);
    expect(expiryOf(response.body.url) - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(ttl + 2);
  });
});

describe('a read URL is only minted for the right caller', () => {
  it('refuses another signed-in user, and does not say the document exists', async (ctx) => {
    needsSupabase(ctx);
    const response = await request(api.server)
      .get(`/kyc/documents/${document.id}`)
      .set(...bearer(strangerToken));

    // 404 rather than 403, deliberately: a 403 confirms the id is real, which
    // turns this route into an oracle for enumerating document ids.
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(response.body).not.toHaveProperty('url');
  });

  it('answers the same way for an id that does not exist at all', async (ctx) => {
    needsSupabase(ctx);
    const response = await request(api.server)
      .get(`/kyc/documents/${randomUUID()}`)
      .set(...bearer(ownerToken));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('refuses an anonymous caller', async (ctx) => {
    needsSupabase(ctx);
    const response = await request(api.server).get(`/kyc/documents/${document.id}`);
    expect(response.status).toBe(401);
  });

  it("does not list another user's documents", async (ctx) => {
    needsSupabase(ctx);
    const response = await request(api.server)
      .get('/kyc/documents')
      .set(...bearer(strangerToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('lets an admin read it, which is the one intended exception', async (ctx) => {
    needsSupabase(ctx);
    const response = await request(api.server)
      .get(`/kyc/documents/${document.id}`)
      .set(...bearer(adminToken));

    expect(response.status).toBe(200);
    expect((await fetch(response.body.url)).status).toBe(200);
  });

  it('keeps the object private to anyone without a signature', async (ctx) => {
    needsSupabase(ctx);
    const unsigned = `${api.config.get('SUPABASE_URL')}/storage/v1/object/public/${BUCKETS.kyc}/${document.path}`;
    expect((await fetch(unsigned)).status).not.toBe(200);
  });
});

describe('the owning user id in the path is the caller, not the token subject', () => {
  it('uses our users.id rather than the Supabase auth id', async (ctx) => {
    needsSupabase(ctx);
    // They are different uuids. Mixing them up would namespace the folder by a
    // value the RLS policies do not know about.
    const me = await request(api.server)
      .get('/auth/me')
      .set(...bearer(ownerToken));

    expect(me.body.id).not.toBe(ownerAuthId);
    expect(document.path.startsWith(`${me.body.id}/`)).toBe(true);
  });
});

describe('opening a document is a privileged write', () => {
  it('moves the user NONE -> PENDING and leaves an audit entry', async (ctx) => {
    needsSupabase(ctx);

    // app_role holds no INSERT on kyc_documents.status and no UPDATE on
    // users.kyc_status, so this whole transition happens in
    // PrivilegedWritesService or not at all.
    const fresh = await seedUser({ kycStatus: 'NONE' });
    planted.push(fresh.authUserId);
    const token = await api.mint({ sub: fresh.authUserId });

    const created = await request(api.server)
      .post('/kyc/documents')
      .set(...bearer(token))
      .send({ docType: 'SELFIE', contentType: 'image/jpeg' });

    expect(created.status).toBe(201);
    expect(created.body.kycStatus).toBe('PENDING');
    uploaded.push(created.body.path);

    const row = await fixtureDb.user.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(row.kycStatus).toBe('PENDING');

    const document = await fixtureDb.kycDocument.findUniqueOrThrow({
      where: { id: created.body.documentId },
    });
    // The default, because the column is not in app_role's INSERT grant and the
    // privileged path does not pass it either.
    expect(document.status).toBe('PENDING');

    const audit = await fixtureDb.auditLog.findFirst({
      where: { entity: 'kyc_documents', entityId: created.body.documentId },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(fresh.id);
    expect(audit!.action).toBe('kyc.document.opened');
    // The path, never the bytes and never a number off the document.
    expect(JSON.stringify(audit!.after)).not.toContain(created.body.path);
  });

  it('does not un-verify somebody who uploads another document', async (ctx) => {
    needsSupabase(ctx);

    const verified = await seedUser({ kycStatus: 'VERIFIED' });
    planted.push(verified.authUserId);

    const created = await request(api.server)
      .post('/kyc/documents')
      .set(...bearer(await api.mint({ sub: verified.authUserId })))
      .send({ docType: 'ADDRESS_PROOF', contentType: 'image/png' });

    expect(created.body.kycStatus).toBe('VERIFIED');
    uploaded.push(created.body.path);
    expect((await fixtureDb.user.findUniqueOrThrow({ where: { id: verified.id } })).kycStatus).toBe('VERIFIED');
  });
});
