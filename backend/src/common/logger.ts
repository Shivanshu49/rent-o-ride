import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../config/config.module';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Structured JSON logging with one request id threaded through every layer.
 *
 * The id itself is minted by Fastify (see main.ts) and picked up here as
 * req.id. BullMQ jobs carry the same id in their payload (Phase 6) — a booking
 * that fails in a worker has to be findable from the HTTP request that queued it.
 *
 * Redaction is not optional: phone numbers, payment payloads and KYC storage
 * paths must never reach a log aggregator.
 */
export function loggerConfig(config: AppConfig): Params {
  const isProduction = config.isProduction;

  return {
    pinoHttp: {
      level: config.get('LOG_LEVEL'),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-razorpay-signature"]',
          'req.body.phone',
          'req.body.otp',
          'req.body.storagePath',
          'res.headers["set-cookie"]',
          '*.phone',
          '*.storage_path',
          '*.storagePath',
          '*.raw',
          '*.card',
        ],
        censor: '[redacted]',
      },
      customProps: (req) => ({ requestId: req.id }),
      autoLogging: {
        ignore: (req) => req.url === '/health' || req.url === '/health/live',
      },
      ...(isProduction
        ? {}
        : { transport: { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } } }),
    },
  };
}
