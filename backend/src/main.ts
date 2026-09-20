import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { REQUEST_ID_HEADER } from './common/logger';
import { AppConfig } from './config/config.module';

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
    // Fastify adopts an inbound x-request-id as req.id, so a trace started at
    // the web tier survives the hop, and mints one when there is none. Doing it
    // here rather than in an interceptor means req.id is already correct in
    // pino, in the exception filters and in anything a guard logs.
    requestIdHeader: REQUEST_ID_HEADER,
    genReqId: () => randomUUID(),
  });

  adapter.getInstance().addHook('onRequest', (req, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, req.id);
    done();
  });

  // bodyParser: false stops Nest installing its own application/json parser, so
  // the one below is the only one. Registering both throws FST_ERR_CTP_ALREADY_PRESENT.
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
    bodyParser: false,
  });

  /**
   * Webhook HMAC is computed over the EXACT bytes the provider sent. Fastify
   * parses JSON by default, and re-serializing a parsed object does not
   * reproduce those bytes — key order, whitespace and number formatting all
   * drift, and every signature check fails.
   *
   * So: parse as a buffer, and stash the raw copy only for /webhooks/* .
   * Keeping a Buffer of every request body alive for the whole app would be a
   * pointless allocation on the hot path.
   */
  adapter.getInstance().addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body: Buffer, done) => {
      if (req.url?.startsWith('/webhooks/')) {
        (req as FastifyRequest & { rawBody?: Buffer }).rawBody = body;
      }
      try {
        done(null, body.length ? JSON.parse(body.toString('utf8')) : {});
      } catch {
        done(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }), undefined);
      }
    },
  );

  app.useLogger(app.get(Logger));
  const config = app.get(AppConfig);

  // Order matters: Nest runs filters last-registered-first, so the Prisma
  // filter gets first refusal and rethrows anything it does not recognise.
  app.useGlobalFilters(new AllExceptionsFilter(), new PrismaExceptionFilter());

  app.enableCors({
    origin: config.get('WEB_ORIGIN'), // exactly one origin. No wildcard, ever —
    credentials: true, //                wildcard + credentials is rejected by
    maxAge: 86_400, //                   browsers anyway, and hides the mistake.
    exposedHeaders: ['x-request-id', 'retry-after'],
  });

  // Drain BullMQ workers and close DB/Redis sockets before the process exits.
  app.enableShutdownHooks();

  mountSwagger(app, config);

  const port = config.get('PORT');
  await app.listen({ port, host: '0.0.0.0' });
  app.get(Logger).log(`API listening on :${port} (${config.get('NODE_ENV')})`);
}

function mountSwagger(app: NestFastifyApplication, config: AppConfig): void {
  const password = config.get('SWAGGER_PASSWORD');

  // In production the docs describe every route and DTO we have. That is fine
  // behind a password and not fine in the open, so with no password set we
  // simply do not mount them.
  if (config.isProduction && !password) return;

  if (config.isProduction) {
    const expected = `Basic ${Buffer.from(`${config.get('SWAGGER_USER')}:${password}`).toString('base64')}`;
    app.getHttpAdapter().getInstance().addHook('onRequest', (req: FastifyRequest, reply: FastifyReply, done) => {
      if (!req.url.startsWith('/docs')) return done();
      const provided = req.headers.authorization ?? '';
      const a = Buffer.from(provided);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return done();
      void reply.header('WWW-Authenticate', 'Basic realm="docs"').status(401).send();
    });
  }

  // cleanupOpenApiDoc turns the Zod schemas nestjs-zod attaches into real
  // OpenAPI schemas, instead of the empty objects Swagger would emit.
  const document = cleanupOpenApiDoc(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Rent-O-Ride API')
        .setDescription('Multi-vehicle rental platform — car / bike / bicycle / scooter')
        .setVersion('0.1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
        .build(),
    ),
  );
  SwaggerModule.setup('docs', app, document);
}

void bootstrap();
