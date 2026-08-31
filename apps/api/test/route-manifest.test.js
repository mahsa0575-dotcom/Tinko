import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import crypto from 'node:crypto';

/**
 * Route-manifest regression test.
 * Guards against the class of bug where a route-registered-after-static
 * mismatch or missing prefix silently 404s panel endpoints (the
 * /api/v1/auth/me 404 incident). Builds a real server with stubbed repos
 * and asserts every panel-critical route responds (not 404).
 */

function makeCtx(overrides = {}) {
  const repos = {
    admin: {
      count: async () => 1,
      create: async (x) => ({ id: 1, ...x }),
      listRoles: async () => [{ id: 1, key: 'super_admin' }],
      assignRole: async () => {},
      byId: async () => null,
      byEmail: async () => null,
      verifyCredentials: async () => null,
      permissionsFor: async () => ['*'],
      findSession: async () => null,
      createSession: async () => {},
      revokeSession: async () => {},
      revokeAllSessions: async () => {},
      listSessions: async () => [],
      recordFailedLogin: async () => {},
    },
    ops: {
      heartbeat: async () => {},
      markOffline: async () => {},
      audit: async () => {},
      usageSummary: async () => ({}),
      listAudit: async () => [],
      listNotifications: async () => [],
      serviceHealth: async () => [],
      latestResourceMetrics: async () => null,
      getSetting: async () => ({}),
    },
  };
  const ctx = {
    config: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      API_PORT: 0,
      API_HOST: '127.0.0.1',
      PUBLIC_BASE_URL: 'http://localhost',
      SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
      ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
      BOOTSTRAP_ADMIN_EMAIL: '',
      BOOTSTRAP_ADMIN_PASSWORD: '',
    },
    repos,
    pool: { query: async () => ({ rows: [], rowCount: 0 }), end: async () => {} },
    redis: { ping: async () => 'PONG', quit: async () => {} },
    router: { breakerSnapshot: async () => [] },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    ...overrides,
  };
  return ctx;
}

// Routes the panel calls on boot or on user paths — a 404 here is a regression.
const PANEL_CRITICAL_ROUTES = [
  ['GET', '/api/v1/auth/me'],
  ['POST', '/api/v1/auth/login'],
  ['POST', '/api/v1/auth/refresh'],
  ['POST', '/api/v1/auth/logout'],
  ['GET', '/api/v1/auth/sessions'],
  ['GET', '/api/v1/analytics/summary'],
  ['GET', '/api/v1/analytics/timeseries'],
  ['GET', '/api/v1/system/health'],
  ['GET', '/api/v1/notifications'],
  ['GET', '/api/v1/audit'],
  ['GET', '/api/v1/resources/latest'],
];

describe('route manifest — panel endpoints are mounted under /api/v1', () => {
  let server;

  beforeAll(async () => {
    const built = await buildServer({ ctx: makeCtx() });
    server = built.fastify;
  });

  afterAll(async () => { await server?.close(); });

  for (const [method, url] of PANEL_CRITICAL_ROUTES) {
    it(`${method} ${url} must NOT 404`, async () => {
      const res = await server.inject({ method, url });
      expect(res.statusCode).not.toBe(404);
    });
  }

  it('auth/me without token → 401 (not 404)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('login with bad credentials → 401 with error envelope', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: 'nobody@example.com', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('login requires email+password → 400 validation', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('unknown /api path → structured 404', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/definitely-not-a-route' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
