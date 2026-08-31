/** Community routes: groups, users, memories, blacklists, moderation. */
export async function registerCommunityRoutes(fastify, { ctx }) {
  const { repos } = ctx;
  const guard = (perm) => ({ onRequest: [fastify.authenticate, fastify.requirePermission(perm)] });

  // ---------- Groups ----------
  fastify.get('/groups', guard('groups.read'), async (req) => {
    const { search, limit, offset } = req.query;
    return repos.telegram.listGroups(1, {
      search, limit: Math.min(Number(limit) || 50, 200), offset: Number(offset) || 0,
    });
  });

  fastify.get('/groups/:id', guard('groups.read'), async (req) => {
    const group = (await ctx.pool.query(
      `SELECT g.*, gs.response_mode, gs.ai_enabled, gs.model_profile_key, gs.moderation_policy,
              gs.memory_policy, gs.context_messages, gs.temperature
       FROM telegram_groups g LEFT JOIN group_settings gs ON gs.group_id = g.id
       WHERE g.tenant_id = 1 AND g.id = $1`, [req.params.id])).rows[0];
    if (!group) throw Errors.notFound('Group');
    const admins = (await ctx.pool.query(
      `SELECT telegram_id, display_name, tg_role, permissions, synced_at FROM group_admins WHERE group_id = $1`, [group.id])).rows;
    return { ...group, admins };
  });

  fastify.patch('/groups/:id/settings', guard('groups.write'), async (req) => {
    const group = (await ctx.pool.query(
      `SELECT id FROM telegram_groups WHERE tenant_id = 1 AND id = $1`, [req.params.id])).rows[0];
    if (!group) throw Errors.notFound('Group');
    await repos.telegram.updateGroupSettings(group.id, req.body ?? {});
    await repos.ops.audit({ tenantId: 1, actorId: req.admin.id, action: 'group.settings_updated', entityType: 'group', entityId: group.id, after: req.body, requestId: req.id });
    return repos.telegram.getGroupSettings(group.id);
  });

  // ---------- Users ----------
  /** All users the bot has interacted with, incl. AI usage + memory counts. */
  fastify.get('/users', guard('users.read'), async (req) => {
    const { search, limit = 50, offset = 0 } = req.query;
    const params = [1];
    let cond = 'tenant_id = $1';
    if (search) {
      params.push(`%${search}%`);
      cond += ` AND (username ILIKE $${params.length} OR first_name ILIKE $${params.length} OR telegram_id::text = $${params.length})`;
    }
    return (await ctx.pool.query(
      `SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name, u.language_code,
              u.first_seen_at, u.last_seen_at, u.message_count, u.status,
              COALESCE(us.requests, 0)::int AS ai_requests,
              COALESCE(us.tokens, 0)::bigint AS tokens,
              COALESCE(mm.memories, 0)::int AS memory_count
       FROM telegram_users u
       LEFT JOIN (
         SELECT user_id, count(*) AS requests, sum(tokens_in + tokens_out) AS tokens
         FROM usage_records WHERE status = 'success' AND user_id IS NOT NULL GROUP BY user_id
       ) us ON us.user_id = u.id
       LEFT JOIN (
         SELECT user_id, count(*) AS memories
         FROM memories WHERE status = 'active' AND user_id IS NOT NULL GROUP BY user_id
       ) mm ON mm.user_id = u.id
       WHERE ${cond}
       ORDER BY u.last_seen_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, Math.min(Number(limit), 200), Number(offset)])).rows;
  });

  /** Per-user memory inspection (spec §9, §33). */
  fastify.get('/users/:id/memories', guard('memory.read'), async (req) => {
    const user = (await ctx.pool.query(
      `SELECT id FROM telegram_users WHERE tenant_id = 1 AND id = $1`, [req.params.id])).rows[0];
    if (!user) throw Errors.notFound('User');
    return (await ctx.pool.query(
      `SELECT * FROM memories WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100`,
      [user.id])).rows;
  });

  fastify.get('/users/:id', guard('users.read'), async (req) => {
    const user = (await ctx.pool.query(
      `SELECT * FROM telegram_users WHERE tenant_id = 1 AND id = $1`, [req.params.id])).rows[0];
    if (!user) throw Errors.notFound('User');
    const usage = (await ctx.pool.query(
      `SELECT count(*)::int AS requests, COALESCE(sum(tokens_in),0) AS tokens_in, COALESCE(sum(tokens_out),0) AS tokens_out
       FROM usage_records WHERE user_id = $1`, [user.id])).rows[0];
    const warnings = (await ctx.pool.query(
      `SELECT * FROM warnings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [user.id])).rows;
    return { ...user, usage, warnings };
  });

  fastify.patch('/users/:id/status', guard('users.write'), async (req) => {
    const { status } = req.body ?? {};
    if (!['active', 'shadow_ignored', 'blocked'].includes(status)) throw Errors.validation([{ message: 'invalid status' }]);
    const { rows } = await ctx.pool.query(
      `UPDATE telegram_users SET status = $2 WHERE tenant_id = 1 AND id = $1 RETURNING *`,
      [req.params.id, status]);
    if (!rows[0]) throw Errors.notFound('User');
    return rows[0];
  });

  // ---------- Memories ----------
  fastify.get('/memories', guard('memory.read'), async (req) => {
    const { search, limit, offset } = req.query;
    return repos.memory.listForAdmin(1, { search, limit: Math.min(Number(limit) || 50, 200), offset: Number(offset) || 0 });
  });

  fastify.patch('/memories/:id', guard('memory.write'), async (req) => {
    const updated = await repos.memory.update(1, req.params.id, req.body ?? {});
    if (!updated) throw Errors.notFound('Memory');
    return updated;
  });

  fastify.delete('/memories/:id', guard('memory.write'), async (req) => {
    await repos.memory.remove(1, req.params.id);
    return { ok: true };
  });

  // ---------- Blacklists ----------
  fastify.get('/blacklists', guard('moderation.read'), async () => repos.blacklist.list(1));

  fastify.post('/blacklists', guard('moderation.write'), async (req) => {
    const b = req.body ?? {};
    if (!b.kind || !b.telegram_id) throw Errors.validation([{ message: 'kind and telegram_id required' }]);
    const entry = await repos.blacklist.add(1, b);
    await repos.ops.audit({ tenantId: 1, actorId: req.admin.id, action: 'blacklist.added', entityType: 'blacklist', entityId: entry.id, after: { kind: b.kind, telegram_id: b.telegram_id }, requestId: req.id });
    return entry;
  });

  fastify.delete('/blacklists/:id', guard('moderation.write'), async (req) => {
    await repos.blacklist.remove(1, req.params.id);
    return { ok: true };
  });

  // ---------- Moderation ----------
  fastify.get('/moderation/rules', guard('moderation.read'), async () =>
    (await ctx.pool.query(`SELECT * FROM moderation_rules WHERE tenant_id = 1 ORDER BY created_at DESC`)).rows);

  fastify.post('/moderation/rules', guard('moderation.write'), async (req) => {
    const rule = await repos.moderation.createRule(1, req.body ?? {});
    await repos.ops.audit({ tenantId: 1, actorId: req.admin.id, action: 'moderation.rule_created', entityType: 'moderation_rule', entityId: rule.id, requestId: req.id });
    return rule;
  });

  fastify.get('/moderation/events', guard('moderation.read'), async (req) => {
    const { limit = 50, offset = 0 } = req.query;
    return (await ctx.pool.query(
      `SELECT me.*, u.username AS user_username
       FROM moderation_events me LEFT JOIN telegram_users u ON u.id = me.user_id
       WHERE me.tenant_id = 1 ORDER BY me.created_at DESC LIMIT $1 OFFSET $2`,
      [Math.min(Number(limit), 200), Number(offset)])).rows;
  });

  fastify.get('/moderation/warnings', guard('moderation.read'), async (req) => {
    const { limit = 100, offset = 0 } = req.query;
    return (await ctx.pool.query(
      `SELECT w.*, u.username, u.first_name FROM warnings w
       LEFT JOIN telegram_users u ON u.id = w.user_id
       WHERE w.tenant_id = 1 ORDER BY w.created_at DESC LIMIT $1 OFFSET $2`,
      [Math.min(Number(limit), 500), Number(offset)])).rows;
  });
}
