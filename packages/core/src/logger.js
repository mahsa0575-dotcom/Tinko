/**
 * Structured JSON logger with correlation IDs.
 * Every log line is a single JSON object: { ts, level, msg, ...context }.
 * Secrets must never be passed to the logger; callers are responsible,
 * and the redactor below strips obvious key names as a safety net.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACT_KEYS = /api[_-]?key|token|secret|password|authorization|credential/i;

let currentLevel = 'info';

export function setLogLevel(level) {
  if (LEVELS[level]) currentLevel = level;
}

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACT_KEYS.test(k) ? '[REDACTED]' : typeof v === 'object' && v !== null ? redact(v) : v;
  }
  return out;
}

function write(level, msg, context) {
  if (LEVELS[level] < LEVELS[currentLevel]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...redact(context ?? {}),
  });
  if (LEVELS[level] >= LEVELS.error) process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

/** Create a child logger bound to correlation context (request_id, trace_id, ...). */
export function createLogger(context = {}) {
  return {
    debug: (msg, ctx) => write('debug', msg, { ...context, ...ctx }),
    info: (msg, ctx) => write('info', msg, { ...context, ...ctx }),
    warn: (msg, ctx) => write('warn', msg, { ...context, ...ctx }),
    error: (msg, ctx) => write('error', msg, { ...context, ...ctx }),
    child: (extra) => createLogger({ ...context, ...extra }),
  };
}

export const logger = createLogger();
