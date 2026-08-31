import crypto from 'node:crypto';
import fp from 'fastify-plugin';
import { Errors, AppError, hmacSign, safeEqual, randomToken, newId,
  encryptSecret, decryptSecret, generateTotpSecret, verifyTotp, sha256Hex } from '@botai/core';

/**
 * Session authentication for the Admin Panel.
 * - Access token: short-lived (15 min) HMAC-signed `payload.signature`, sent as Bearer.
 * - Refresh token: opaque random, stored hashed in admin_sessions, delivered as
 *   HttpOnly + SameSite=Strict cookie (never readable by the SPA).
 * - Permissions are loaded from the DB on each request, so role changes apply immediately.
 */

const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_S = 7 * 24 * 3600;

function signAccess(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmacSign(body, secret)}`;
}

function verifyAccess(token, secret) {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  if (!safeEqual(sig, hmacSign(body, secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Request decorators only. This half IS fastify-plugin-wrapped, so that
 * `authenticate` / `requirePermission` escape encapsulation and are visible
 * to the sibling route plugins that guard their routes with them.
 */
async function authDecorators(fastify, { ctx }) {
  const { repos, config } = ctx;

  // ---- decorators ----
  fastify.decorate('authenticate', async (req, reply) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const payload = token ? verifyAccess(token, config.SESSION_SECRET) : null;
    if (!payload) throw Errors.unauthorized();
    const admin = await repos.admin.byId(payload.sub);
    if (!admin || admin.status !== 'active') throw Errors.unauthorized('Session is no longer valid');
    const session = await repos.admin.findSession(payload.sid);
    if (!session || session.revoked_at || session.expires_at < new Date()) {
      throw Errors.unauthorized('Session revoked');
    }
    req.admin = { id: admin.id, email: admin.email, tenantId: admin.tenant_id, displayName: admin.display_name, sessionId: session.id };
    req.permissions = await repos.admin.permissionsFor(admin.id);
  });

  fastify.decorate('requirePermission', (required, mode = 'all') => async (req) => {
    const granted = req.permissions ?? [];
    const list = Array.isArray(required) ? required : [required];
    const ok = mode === 'any'
      ? list.some((p) => granted.includes('*') || granted.includes(p))
      : list.every((p) => granted.includes('*') || granted.includes(p));
    if (!ok) throw Errors.forbidden();
  });
}

/**
 * Auth routes. Deliberately NOT fastify-plugin-wrapped: `fp` sets `skip-override`,
 * which makes Fastify silently ignore the `prefix` registration option — that is
 * exactly what mounted these at /auth/* instead of /api/v1/auth/* and made every
 * panel login 404. Keep this a plain plugin so the prefix is honoured.
 */
async function authRoutes(fastify, { ctx }) {
  const { repos, config } = ctx;

  // ---- helpers ----
  async function issueSession(req, admin, reply) {
    const sessionId = newId('ses');
    const refreshToken = randomToken(48);
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await repos.admin.createSession({
      adminId: admin.id, sessionId, refreshHash,
      userAgent: req.headers['user-agent'] ?? '', ip: req.ip,
      expiresAt: new Date(Date.now() + REFRESH_TTL_S * 1000),
    });
    const accessToken = signAccess({ sub: admin.id, sid: sessionId, exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_S }, config.SESSION_SECRET);
    reply.setCookie('botai_refresh', refreshToken, {
      httpOnly: true, sameSite: 'strict', secure: config.NODE_ENV === 'production',
      path: '/api/v1/auth', maxAge: REFRESH_TTL_S,
    });
    return { accessToken, expiresIn: ACCESS_TTL_S, sessionId };
  }

  // ---- routes ----
  fastify.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', minLength: 3, maxLength: 254 },
          password: { type: 'string', minLength: 1, maxLength: 512 },
          code: { type: 'string', maxLength: 32 },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password, code } = req.body ?? {};
    if (!email || !password) throw Errors.validation([{ path: 'email', message: 'email and password required' }]);
    const admin = await repos.admin.verifyCredentials(1, email, password);
    if (!admin) {
      // Audit brute-force attempts, then a generic error (no user enumeration).
      const existing = await repos.admin.byEmail(1, email);
      if (existing) {
        await repos.admin.recordFailedLogin(existing.id);
        await repos.ops.audit({ tenantId: 1, actorId: existing.id, action: 'auth.login_failed', request_id: req.id, ip: req.ip });
      }
      throw Errors.unauthorized('Invalid email or password');
    }
    // 2FA (spec §122): TOTP code or single-use recovery code required.
    if (admin.totp_enabled && admin.totp_secret) {
      if (!code) throw new AppError('TOTP_REQUIRED', 'کد دو مرحله‌ای لازم است', 401);
      const secret = decryptSecret(admin.totp_secret, config.ENCRYPTION_KEY);
      if (!verifyTotp(secret, code)) {
        // Recovery-code fallback: single use, stored hashed.
        const hash = sha256Hex(String(code).trim().replace(/-/g, ''));
        const { rowCount } = await ctx.pool.query(
          `UPDATE admin_users SET recovery_codes = array_remove(recovery_codes, $2)
           WHERE id = $1 AND $2 = ANY(recovery_codes)`, [admin.id, hash]);
        if (rowCount === 0) {
          await repos.ops.audit({ tenantId: 1, actorId: admin.id, action: 'auth.totp_failed', request_id: req.id, ip: req.ip });
          throw Errors.unauthorized('کد دو مرحله‌ای نامعتبر است');
        }
        await repos.ops.audit({ tenantId: 1, actorId: admin.id, action: 'auth.recovery_code_used', request_id: req.id, ip: req.ip });
      }
    }
    const session = await issueSession(req, admin, reply);
    await repos.ops.audit({ tenantId: admin.tenant_id, actorId: admin.id, action: 'auth.login', request_id: req.id, ip: req.ip });
    return { accessToken: session.accessToken, expiresIn: session.expiresIn };
  });

  // ---- 2FA management (spec §121–122) ----
  fastify.post('/auth/2fa/setup', { onRequest: fastify.authenticate }, async (req) => {
    const admin = await repos.admin.byId(req.admin.id);
    if (admin.totp_enabled) throw Errors.conflict('2FA already enabled — disable it first');
    const secret = generateTotpSecret();
    await ctx.pool.query(`UPDATE admin_users SET totp_secret = $2 WHERE id = $1`,
      [admin.id, encryptSecret(secret, ctx.config.ENCRYPTION_KEY)]);
    return {
      secret,
      otpauth: `otpauth://totp/BotAI:${encodeURIComponent(admin.email)}?secret=${secret}&issuer=BotAI`,
    };
  });

  fastify.post('/auth/2fa/enable', { onRequest: fastify.authenticate }, async (req) => {
    const admin = await repos.admin.byId(req.admin.id);
    if (!admin.totp_secret) throw Errors.validation([{ message: 'run setup first' }]);
    const secret = decryptSecret(admin.totp_secret, ctx.config.ENCRYPTION_KEY);
    if (!verifyTotp(secret, req.body?.code)) throw Errors.unauthorized('کد نامعتبر است');
    const recoveryCodes = Array.from({ length: 8 }, () =>
      `${randomToken(4).slice(0, 4)}-${randomToken(4).slice(0, 4)}`);
    const hashes = recoveryCodes.map((c) => sha256Hex(c));
    await ctx.pool.query(
      `UPDATE admin_users SET totp_enabled = true, recovery_codes = $2 WHERE id = $1`,
      [admin.id, hashes]);
    await repos.ops.audit({ tenantId: 1, actorId: admin.id, action: 'auth.2fa_enabled', request_id: req.id, ip: req.ip });
    // Plaintext codes are shown exactly once.
    return { recoveryCodes };
  });

  fastify.post('/auth/2fa/disable', { onRequest: fastify.authenticate }, async (req) => {
    const admin = await repos.admin.byId(req.admin.id);
    if (!admin.totp_enabled) return { ok: true };
    const secret = decryptSecret(admin.totp_secret, ctx.config.ENCRYPTION_KEY);
    if (!verifyTotp(secret, req.body?.code)) throw Errors.unauthorized('کد نامعتبر است');
    await ctx.pool.query(
      `UPDATE admin_users SET totp_enabled = false, totp_secret = NULL, recovery_codes = '{}' WHERE id = $1`,
      [admin.id]);
    await repos.ops.audit({ tenantId: 1, actorId: admin.id, action: 'auth.2fa_disabled', request_id: req.id, ip: req.ip });
    return { ok: true };
  });

  fastify.post('/auth/refresh', async (req, reply) => {
    const refreshToken = req.cookies.botai_refresh;
    if (!refreshToken) throw Errors.unauthorized('No refresh token');
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const { rows } = await ctx.pool.query(`SELECT * FROM admin_sessions WHERE refresh_hash = $1`, [refreshHash]);
    const session = rows[0];
    if (!session || session.revoked_at || session.expires_at < new Date()) throw Errors.unauthorized('Session expired');
    const admin = await repos.admin.byId(session.admin_id);
    if (!admin || admin.status !== 'active') throw Errors.unauthorized();
    // Rotation: revoke old, issue new.
    await repos.admin.revokeSession(session.id);
    const issued = await issueSession(req, admin, reply);
    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn };
  });

  fastify.post('/auth/logout', { onRequest: fastify.authenticate }, async (req) => {
    await repos.admin.revokeSession(req.admin.sessionId);
    await repos.ops.audit({ tenantId: req.admin.tenantId, actorId: req.admin.id, action: 'auth.logout', request_id: req.id, ip: req.ip });
    return { ok: true };
  });

  fastify.get('/auth/me', { onRequest: fastify.authenticate }, async (req) => ({
    id: req.admin.id, email: req.admin.email, displayName: req.admin.displayName,
    tenantId: req.admin.tenantId, permissions: req.permissions,
  }));

  fastify.get('/auth/sessions', { onRequest: fastify.authenticate }, async (req) =>
    repos.admin.listSessions(req.admin.id));

  fastify.delete('/auth/sessions/:id', { onRequest: fastify.authenticate }, async (req) => {
    // Scope to the caller: an admin may only revoke their own sessions.
    const revoked = await repos.admin.revokeSession(req.params.id, req.admin.id);
    if (!revoked) throw Errors.notFound('Session');
    return { ok: true };
  });

  fastify.delete('/auth/sessions', { onRequest: fastify.authenticate }, async (req) => {
    await repos.admin.revokeAllSessions(req.admin.id, req.admin.sessionId);
    return { ok: true };
  });
}

// fastify-plugin: expose decorators (authenticate/requirePermission) to sibling plugins.
// Routes are exported separately and registered WITHOUT fp so their prefix applies.
export default fp(authDecorators, { name: 'auth', dependencies: [] });
export { authDecorators, authRoutes };
