import Fastify from 'fastify';
import path from 'node:path';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Errors, setLogLevel } from '@botai/core';
import { createContext } from './context.js';
import authPlugin from './auth.js';
import { registerAiRoutes } from './routes/ai-routes.js';
import { registerCommunityRoutes } from './routes/community-routes.js';
import { registerPlatformRoutes } from './routes/platform-routes.js';
import { registerDebugRoutes } from './routes/debug-routes.js';

/**
 * Admin Panel API server (also hosts the Telegram webhook endpoint).
 * Every response error uses { error: { code, message, request_id } }.
 */
export async function buildServer(overrides = {}) {
  const ctx = overrides.ctx ?? (await createContext(overrides));
  setLogLevel(ctx.config.LOG_LEVEL);
  const log = ctx.logger;

  const fastify = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
    genReqId: () => cryptoRequestId(),
  });

  function cryptoRequestId() {
    return `req_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  }

  await fastify.register(helmet, { contentSecurityPolicy: false });
  await fastify.register(cors, {
    origin: ctx.config.NODE_ENV === 'production' ? true : true,
    credentials: true,
  });
  await fastify.register(cookie);
  await fastify.register(rateLimit, { global: false });

  // Structured request logging with request_id correlation
  fastify.addHook('onRequest', async (req) => {
    req.startTime = Date.now();
    req.logContext = { request_id: req.id, method: req.method, url: req.url };
  });
  fastify.addHook('onResponse', async (req, reply) => {
    log.info('http_request', {
      ...req.logContext,
      status: reply.statusCode,
      duration_ms: Date.now() - req.startTime,
      ip: req.ip,
    });
  });

  // Standard error format; AppError codes pass through, everything else is hidden.
  fastify.setErrorHandler((err, req, reply) => {
    if (err.statusCode === 429) err = Errors.rateLimited();
    const isApp = err.name === 'AppError' || err.statusCode && err.statusCode < 500 && err.name !== 'FastifyError';
    const status = isApp ? err.statusCode ?? 500 : 500;
    const code = isApp && err.code ? err.code : 'INTERNAL_ERROR';
    const message = isApp ? err.message : 'Internal server error';
    if (!isApp) log.error('unhandled_error', { ...req.logContext, error: err.message, stack: err.stack });
    else if (status >= 400) log.warn('request_error', { ...req.logContext, code, error: err.message });
    reply.status(status).send({
      error: { code, message, request_id: req.id, details: err.details ?? undefined },
    });
  });

  fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  // Serve the built Admin Panel (apps/admin/dist) when present (production).
  try {
    const { existsSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    // server.js lives at <root>/apps/api/src → panel build output at <root>/apps/admin/dist
    const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../admin/dist');
    if (existsSync(distDir)) {
      const fastifyStatic = (await import('@fastify/static')).default;
      await fastify.register(fastifyStatic, { root: distDir, wildcard: false });
      fastify.setNotFoundHandler((req, reply) => {
        if (req.raw.url.startsWith('/api/') || req.raw.url.startsWith('/webhooks/')) {
          reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found', request_id: req.id } });
        } else {
          reply.sendFile('index.html'); // SPA routing
        }
      });
      log.info('admin panel static assets mounted', { distDir });
    }
  } catch (err) {
    log.warn('admin panel static serving unavailable', { error: err.message });
  }

  await fastify.register(authPlugin, { ctx });
  await fastify.register(registerAiRoutes, { ctx });
  await fastify.register(registerCommunityRoutes, { ctx });
  await fastify.register(registerPlatformRoutes, { ctx });
  await fastify.register(registerDebugRoutes, { ctx });

  // OpenAPI documentation (served as JSON; a future panel page renders it)
  fastify.get('/api/v1/openapi.json', async () => ({
    openapi: '3.0.3',
    info: { title: 'BotAI Platform API', version: '0.1.0', description: 'Enterprise multi-tenant AI Telegram platform API' },
    servers: [{ url: ctx.config.PUBLIC_BASE_URL }],
    paths: { '/health': { get: { summary: 'Liveness probe', responses: { '200': { description: 'ok' } } } } },
  }));

  fastify.decorate('ctx', ctx);
  return { fastify, ctx };
}

export async function startServer(overrides = {}) {
  const { fastify, ctx } = await buildServer(overrides);
  await bootstrapAdmin(ctx);
  await fastify.listen({ port: ctx.config.API_PORT, host: ctx.config.API_HOST });
  ctx.logger.info('API server started', { port: ctx.config.API_PORT, env: ctx.config.NODE_ENV });

  // Service heartbeat + graceful shutdown
  await ctx.repos.ops.heartbeat('api', new Date()).catch(() => {});
  const hb = setInterval(() => ctx.repos.ops.heartbeat('api').catch(() => {}), 30_000);

  const shutdown = async (signal) => {
    ctx.logger.info('shutting down', { signal });
    clearInterval(hb);
    await fastify.close().catch(() => {});
    await ctx.repos.ops.markOffline('api').catch(() => {});
    await ctx.pool.end().catch(() => {});
    await ctx.redis.quit().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  return { fastify, ctx };
}

/** First-run setup: create the initial Super Admin when configured and none exists. */
async function bootstrapAdmin(ctx) {
  const { BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD } = ctx.config;
  if (!BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) return;
  const count = await ctx.repos.admin.count();
  if (count > 0) return;
  const admin = await ctx.repos.admin.create({
    email: BOOTSTRAP_ADMIN_EMAIL, password: BOOTSTRAP_ADMIN_PASSWORD, displayName: 'Platform Owner',
  });
  const roles = await ctx.repos.admin.listRoles(1);
  const superAdmin = roles.find((r) => r.key === 'super_admin');
  if (superAdmin) await ctx.repos.admin.assignRole(admin.id, superAdmin.id);
  ctx.logger.info('bootstrap admin created', { email: BOOTSTRAP_ADMIN_EMAIL });
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
