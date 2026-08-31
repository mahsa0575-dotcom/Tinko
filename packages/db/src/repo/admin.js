import { Errors, hashPassword, verifyPassword } from '@botai/core';

/** Admin panel accounts, sessions and roles. */

export function createAdminRepo(pool) {
  const byEmail = async (tenantId, email) => {
    const { rows } = await pool.query(
      `SELECT * FROM admin_users WHERE tenant_id = $1 AND email = $2`, [tenantId, email]);
    return rows[0] ?? null;
  };

  return {
    byEmail,
    byId: async (id) => {
      const { rows } = await pool.query(`SELECT * FROM admin_users WHERE id = $1`, [id]);
      return rows[0] ?? null;
    },
    count: async () => {
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM admin_users`);
      return rows[0].n;
    },
    create: async ({ tenantId = 1, email, password, displayName = '', telegramId = null }) => {
      if (await byEmail(tenantId, email)) throw Errors.conflict('An admin with this email already exists');
      const { rows } = await pool.query(
        `INSERT INTO admin_users (tenant_id, email, password_hash, display_name, telegram_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, tenant_id, email, display_name, telegram_id, status, created_at`,
        [tenantId, email, hashPassword(password), displayName, telegramId]);
      return rows[0];
    },
    verifyCredentials: async (tenantId, email, password) => {
      const admin = await byEmail(tenantId, email);
      if (!admin) return null;
      if (admin.status !== 'active') return null;
      if (admin.locked_until && admin.locked_until > new Date()) return null;
      if (!verifyPassword(password, admin.password_hash)) return null;
      await pool.query(
        `UPDATE admin_users SET failed_logins = 0, last_login_at = now() WHERE id = $1`, [admin.id]);
      return admin;
    },
    recordFailedLogin: async (adminId) => {
      // Brute-force protection: lock after 5 consecutive failures for 15 minutes.
      const { rows } = await pool.query(
        `UPDATE admin_users
         SET failed_logins = failed_logins + 1,
             locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now() + interval '15 minutes' END
         WHERE id = $1 RETURNING failed_logins, locked_until`, [adminId]);
      return rows[0];
    },

    // --- sessions ---
    createSession: async ({ adminId, sessionId, refreshHash, userAgent, ip, expiresAt }) => {
      await pool.query(
        `INSERT INTO admin_sessions (id, admin_id, refresh_hash, user_agent, ip, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sessionId, adminId, refreshHash, userAgent, ip, expiresAt]);
    },
    findSession: async (sessionId) => {
      const { rows } = await pool.query(`SELECT * FROM admin_sessions WHERE id = $1`, [sessionId]);
      return rows[0] ?? null;
    },
    revokeSession: async (sessionId) => {
      await pool.query(`UPDATE admin_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [sessionId]);
    },
    revokeAllSessions: async (adminId, exceptId = null) => {
      await pool.query(
        `UPDATE admin_sessions SET revoked_at = now()
         WHERE admin_id = $1 AND revoked_at IS NULL AND ($2::text IS NULL OR id <> $2)`,
        [adminId, exceptId]);
    },
    listSessions: async (adminId) => {
      const { rows } = await pool.query(
        `SELECT id, user_agent, ip, created_at, expires_at
         FROM admin_sessions WHERE admin_id = $1 AND revoked_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC`, [adminId]);
      return rows;
    },

    // --- roles ---
    permissionsFor: async (adminId) => {
      const { rows } = await pool.query(
        `SELECT COALESCE(array_agg(r.permissions), '{}') AS perms
         FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         WHERE ur.admin_id = $1`, [adminId]);
      return [...new Set(rows[0].perms.flat())];
    },
    listRoles: async (tenantId) => {
      const { rows } = await pool.query(
        `SELECT * FROM roles WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY is_builtin DESC, key`,
        [tenantId]);
      return rows;
    },
    assignRole: async (adminId, roleId) => {
      await pool.query(
        `INSERT INTO user_roles (admin_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [adminId, roleId]);
    },
  };
}
