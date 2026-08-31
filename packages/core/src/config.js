import { z } from 'zod';

/**
 * Central environment configuration.
 * Every required variable is validated once at startup; the process fails fast
 * with a readable message instead of misbehaving later in production.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  API_HOST: z.string().default('0.0.0.0'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:8080'),
  // Comma-separated list of origins allowed to make credentialed cross-origin
  // requests. Empty (default) = same-origin only, which is what the bundled
  // panel needs. Never reflect arbitrary origins alongside credentials.
  CORS_ORIGINS: z.string().default(''),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),

  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional().or(z.literal('')),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(10).optional().or(z.literal('')),
  PLATFORM_OWNER_TELEGRAM_ID: z.string().optional().or(z.literal('')),

  TELEGRAM_BOT_TOKEN: z.string().optional().or(z.literal('')),
  TELEGRAM_MODE: z.enum(['polling', 'webhook']).default('polling'),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().or(z.literal('')),
  TELEGRAM_WEBHOOK_PATH: z.string().default('/webhooks/telegram'),
  BOT_WEBHOOK_PORT: z.coerce.number().int().min(1).max(65535).default(8081),

  METRICS_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),
});

/** @returns {import('zod').infer<typeof schema>} */
export function loadConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example for documentation.`);
  }
  return result.data;
}
