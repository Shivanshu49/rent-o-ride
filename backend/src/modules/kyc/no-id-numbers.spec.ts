/**
 * The privacy claim, enforced instead of intended.
 *
 * We take a photograph of a document, store the path to it, and record a
 * human's verdict. We do not store the NUMBER on the document — not the
 * Aadhaar, not the licence, not a PAN or a passport. Holding those buys nothing
 * (verification is done by looking at the image) while turning this database
 * into something worth stealing and putting us under obligations we have no
 * reason to take on.
 *
 * That is easy to say in a README and easy to undo with one `@map("pan_number")`
 * six months from now. So this test reads the schema, the migrations, the shared
 * Zod schemas and every DTO, and fails if an ID-number field appears in any of
 * them.
 *
 * Comments are stripped before scanning, deliberately: the comments explaining
 * this policy have to be free to name the things the policy forbids.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BACKEND = process.cwd();
const ROOT = resolve(BACKEND, '..');

/**
 * Field names that hold a government identity number.
 *
 * NOT on this list, and deliberately so: `reg_number` / `regNumber`, which is a
 * vehicle number plate. It identifies a car, not a person, it is visible to
 * anyone standing behind the car, and the rental cannot work without it.
 */
/**
 * `\b` is the wrong boundary here: `_` is a word character, so `/\baadhaar\b/`
 * does NOT match `aadhaar_number` — the exact spelling a Prisma `@map` would
 * use. And anchoring the START rules out `drivingLicenceNumber`, which is how
 * the field would actually be spelled in TypeScript.
 *
 * So the distinctive stems match anywhere, and only the genuinely ambiguous
 * ones (`pan`, `ssn`) are anchored. A false positive here is a loud test
 * failure somebody reads; a false negative is a silent leak.
 */
const FORBIDDEN: readonly { label: string; pattern: RegExp }[] = [
  { label: 'aadhaar', pattern: /aadha+r/ },
  { label: 'uidai', pattern: /uidai/ },
  { label: 'pan number', pattern: /(?<![a-z0-9])pan[_\-]?(number|no(?![a-z])|card)/ },
  { label: 'licence number', pattern: /(licence|license|dl)[_\-]?(number|no(?![a-z]))/ },
  { label: 'passport', pattern: /passport/ },
  { label: 'voter id', pattern: /voter[_\-]?id/ },
  { label: 'ssn', pattern: /(?<![a-z0-9])ssn(?![a-z0-9])/ },
  { label: 'national id', pattern: /national[_\-]?id/ },
  { label: 'generic id number', pattern: /id[_\-]?number/ },
  { label: 'document number', pattern: /document[_\-]?number/ },
];

/** Comments only. A `//` inside a string is not worth a parser here — nothing
 *  in these files puts an ID-number field name inside a string literal. */
function stripComments(source: string, extension: string): string {
  let text = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
  text = text.replace(/\/\/.*$/gm, ' ');
  if (extension === '.sql') text = text.replace(/--.*$/gm, ' ');
  return text;
}

function walk(directory: string, matches: (file: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full, matches));
    else if (matches(full)) found.push(full);
  }
  return found;
}

const SCANNED: readonly string[] = [...new Set([
  join(BACKEND, 'prisma', 'schema.prisma'),
  ...walk(join(BACKEND, 'prisma', 'migrations'), (f) => extname(f) === '.sql'),
  ...walk(join(ROOT, 'shared', 'src', 'schemas'), (f) => f.endsWith('.ts')),
  ...walk(join(BACKEND, 'src', 'modules'), (f) => f.includes('/dto/') && f.endsWith('.ts')),
  ...walk(join(BACKEND, 'src', 'modules', 'kyc'), (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts')),
])];

const findings = (text: string): string[] =>
  FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);

describe('no government ID number is stored anywhere', () => {
  it('scans the files it claims to scan', () => {
    // Without this the whole suite passes vacuously the day someone moves a
    // directory: zero files scanned, zero findings, green.
    expect(BACKEND.endsWith('backend')).toBe(true);
    const names = SCANNED.map((f) => basename(f));
    expect(names).toContain('schema.prisma');
    expect(names).toContain('kyc.ts');
    expect(names).toContain('kyc.dto.ts');
    expect(SCANNED.length).toBeGreaterThanOrEqual(6);
  });

  it.each(SCANNED.map((file) => [file.replace(`${ROOT}/`, ''), file] as const))(
    '%s holds no ID-number field',
    (_label, file) => {
      const text = stripComments(readFileSync(file, 'utf8'), extname(file)).toLowerCase();
      expect(findings(text)).toEqual([]);
    },
  );

  it('would actually notice one', () => {
    // The detector's own test. A regex that matches nothing passes every file
    // above forever, which is the failure mode this suite is most exposed to.
    expect(findings('aadhaar_number string')).toContain('aadhaar');
    expect(findings('licenceNumber string'.toLowerCase())).toContain('licence number');
    expect(findings('panCard  string'.toLowerCase())).toContain('pan number');
    expect(findings('idNumber String @map("id_number")'.toLowerCase())).toContain('generic id number');
    expect(findings('passportNo'.toLowerCase())).toContain('passport');
    expect(findings('drivingLicenceNumber'.toLowerCase())).toContain('licence number');
    expect(findings('"aadhaar_number" text not null')).toContain('aadhaar');

    // And that it leaves the vehicle number plate alone.
    expect(findings('regnumber string @map("reg_number")')).toEqual([]);
    expect(findings('license_notes text')).toEqual([]);
    expect(findings('payoutaccountref string')).toEqual([]);
  });

  it('strips comments, so the policy may name what it forbids', () => {
    const prisma = readFileSync(join(BACKEND, 'prisma', 'schema.prisma'), 'utf8');
    // The KycDocument model's doc comment says "no Aadhaar number". That is the
    // documentation working, not a violation.
    expect(prisma.toLowerCase()).toMatch(/aadhaar/);
    expect(findings(stripComments(prisma, '.prisma').toLowerCase())).toEqual([]);
  });
});
