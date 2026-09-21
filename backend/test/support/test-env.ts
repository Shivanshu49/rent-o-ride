import 'dotenv/config';

// Nest's pino logger writes a line per request and per guard rejection, which
// buries the assertion that failed. `fatal` is the quietest level the env
// schema allows.
process.env['LOG_LEVEL'] = 'fatal';
