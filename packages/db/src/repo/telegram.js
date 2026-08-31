/** Telegram users, groups, group settings and membership resolution. */

export function createTelegramRepo(pool) {
  return {
    // --- users ---
    upsertUser: async (tenantId, u) => {
      const { rows } = await pool.query(
        `INSERT INTO telegram_users (tenant_id, telegram_id, username, first_name, last_name, language_code, is_bot)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tenant_id, telegram_id) DO UPDATE
           SET username = EXCLUDED.username,
               first_name = EXCLUDED.first_name,
               last_name = EXCLUDED.last_name,
               language_code = EXCLUDED.language_code,
               last_seen_at = now(),
               message_count = telegram_users.message_count + 1
         RETURNING *`,
        [tenantId, u.id, u.username ?? null, u.first_name ?? null, u.last_name ?? null,
         u.language_code ?? null, u.is_bot ?? false]);
      return rows[0];
    },
    getUser: async (tenantId, telegramId) => {
      const { rows } = await pool.query(
        `SELECT * FROM telegram_users WHERE tenant_id = $1 AND telegram_id = $2`, [tenantId, telegramId]);
      return rows[0] ?? null;
    },

    // --- groups ---
    upsertGroup: async (tenantId, chat) => {
      const { rows } = await pool.query(
        `INSERT INTO telegram_groups (tenant_id, telegram_id, title, username, type)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, telegram_id) DO UPDATE
           SET title = EXCLUDED.title, username = EXCLUDED.username, type = EXCLUDED.type,
               bot_status = EXCLUDED.bot_status, last_activity = now(),
               status = CASE WHEN telegram_groups.status = 'orphaned' THEN 'active' ELSE telegram_groups.status END
         RETURNING *`,
        [tenantId, chat.id, chat.title ?? null, chat.username ?? null,
         chat.type === 'channel' ? 'channel' : chat.type]);
      return rows[0];
    },
    getGroup: async (tenantId, telegramId) => {
      const { rows } = await pool.query(
        `SELECT * FROM telegram_groups WHERE tenant_id = $1 AND telegram_id = $2`, [tenantId, telegramId]);
      return rows[0] ?? null;
    },
    markGroupLeft: async (tenantId, telegramId) => {
      await pool.query(
        `UPDATE telegram_groups
         SET bot_status = 'left', status = 'orphaned'
         WHERE tenant_id = $1 AND telegram_id = $2`, [tenantId, telegramId]);
    },
    getGroupSettings: async (groupRowId) => {
      // Returns defaults merged with persisted settings; group_settings row is created lazily.
      const defaults = {
        response_mode: 'mention_reply',
        personality_id: null,
        model_profile_key: 'balanced',
        moderation_policy: 'balanced',
        memory_policy: 'conservative',
        ai_enabled: true,
        context_messages: 10,
        temperature: null,
      };
      const { rows } = await pool.query(
        `SELECT * FROM group_settings WHERE group_id = $1`, [groupRowId]);
      return rows[0] ? { ...defaults, ...rows[0] } : defaults;
    },
    updateGroupSettings: async (groupRowId, patch) => {
      const allowed = ['response_mode', 'personality_id', 'model_profile_key', 'moderation_policy',
        'memory_policy', 'ai_enabled', 'context_messages', 'temperature'];
      const cols = Object.keys(patch).filter((k) => allowed.includes(k));
      if (cols.length === 0) return;
      const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
      await pool.query(
        `INSERT INTO group_settings (group_id, ${cols.join(', ')})
         VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
         ON CONFLICT (group_id) DO UPDATE SET ${sets}, updated_at = now()`,
        [groupRowId, ...cols.map((c) => patch[c])]);
    },
    syncGroupAdmins: async (groupRowId, admins) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM group_admins WHERE group_id = $1`, [groupRowId]);
        for (const a of admins) {
          await client.query(
            `INSERT INTO group_admins (group_id, telegram_id, display_name, tg_role, permissions)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
            [groupRowId, a.user.id,
             [a.user.first_name, a.user.last_name].filter(Boolean).join(' ') || a.user.username || '',
             a.status === 'creator' ? 'creator' : 'administrator',
             a.custom_permissions ? JSON.stringify(a.custom_permissions) : '{}']);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    isGroupAdmin: async (groupRowId, telegramId) => {
      const { rows } = await pool.query(
        `SELECT 1 FROM group_admins WHERE group_id = $1 AND telegram_id = $2`, [groupRowId, telegramId]);
      return rows.length > 0;
    },

    listGroups: async (tenantId, { search, limit = 50, offset = 0 } = {}) => {
      const conds = ['tenant_id = $1'];
      const params = [tenantId];
      if (search) {
        params.push(`%${search}%`);
        conds.push(`(title ILIKE $${params.length} OR username ILIKE $${params.length})`);
      }
      const { rows } = await pool.query(
        `SELECT g.*, gs.response_mode, gs.ai_enabled, gs.model_profile_key
         FROM telegram_groups g LEFT JOIN group_settings gs ON gs.group_id = g.id
         WHERE ${conds.join(' AND ')}
         ORDER BY g.last_activity DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]);
      return rows;
    },

    setGroupStatus: async (tenantId, telegramId, status, health) => {
      await pool.query(
        `UPDATE telegram_groups SET status = COALESCE($3, status), health = COALESCE($4, health)
         WHERE tenant_id = $1 AND telegram_id = $2`, [tenantId, telegramId, status, health]);
    },
  };
}
