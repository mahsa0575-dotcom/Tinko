#!/usr/bin/env node
/**
 * Tinko admin CLI — runs INSIDE the api container (docker compose exec api node scripts/admin.js)
 *
 *   node scripts/admin.js create <email> <password> [displayName]
 *   node scripts/admin.js reset  <email> <password>
 *   node scripts/admin.js list
 *   node scripts/admin.js promote <email>          # grant super_admin
 *   node scripts/admin.js disable <email>
 */
import { loadConfig, hashPassword } from '@botai/core';
import { createPool, createRepos } from '@botai/db';

const [, , cmd, email, password, displayName] = process.argv;
const usage = () => {
  console.log(`Usage:
  node scripts/admin.js create  <email> <password> [displayName]
  node scripts/admin.js reset   <email> <password>
  node scripts/admin.js list
  node scripts/admin.js promote <email>
  node scripts/admin.js disable <email>`);
  process.exit(1);
};

try {
  const config = loadConfig();
  const pool = createPool(config);
  const repos = createRepos(pool, {
    encrypt: () => { throw new Error('not needed'); },
    decrypt: () => { throw new Error('not needed'); },
    mask: () => '••••',
  });

  if (cmd === 'create') {
    if (!email || !password) usage();
    const admin = await repos.admin.create({ email, password, displayName: displayName ?? '' });
    const roles = await repos.admin.listRoles(1);
    const superAdmin = roles.find((r) => r.key === 'super_admin');
    if (superAdmin) await repos.admin.assignRole(admin.id, superAdmin.id);
    console.log(`✅ admin created: ${email} (super_admin)`);
  } else if (cmd === 'reset') {
    if (!email || !password) usage();
    const admin = await repos.admin.byEmail(1, email);
    if (!admin) { console.error('❌ admin not found'); process.exit(1); }
    await pool.query(
      `UPDATE admin_users SET password_hash = $2, failed_logins = 0, locked_until = NULL, status = 'active' WHERE id = $1`,
      [admin.id, hashPassword(password)]);
    await repos.admin.revokeAllSessions(admin.id);
    console.log(`✅ password reset + sessions revoked: ${email}`);
  } else if (cmd === 'promote') {
    if (!email) usage();
    const admin = await repos.admin.byEmail(1, email);
    if (!admin) { console.error('❌ admin not found'); process.exit(1); }
    const roles = await repos.admin.listRoles(1);
    const superAdmin = roles.find((r) => r.key === 'super_admin');
    if (superAdmin) await repos.admin.assignRole(admin.id, superAdmin.id);
    console.log(`✅ promoted to super_admin: ${email}`);
  } else if (cmd === 'disable') {
    if (!email) usage();
    const admin = await repos.admin.byEmail(1, email);
    if (!admin) { console.error('❌ admin not found'); process.exit(1); }
    await pool.query(`UPDATE admin_users SET status = 'disabled' WHERE id = $1`, [admin.id]);
    await repos.admin.revokeAllSessions(admin.id);
    console.log(`✅ disabled: ${email}`);
  } else if (cmd === 'list') {
    const { rows } = await pool.query(
      `SELECT email, display_name, status, last_login_at FROM admin_users ORDER BY created_at`);
    for (const r of rows) {
      console.log(`${r.status === 'active' ? '🟢' : '🔴'} ${r.email}  ${r.display_name ?? ''}  last: ${r.last_login_at ?? 'never'}`);
    }
    if (!rows.length) console.log('(no admins)');
  } else {
    usage();
  }
  await pool.end();
} catch (err) {
  console.error('❌', err.message);
  process.exit(1);
}
