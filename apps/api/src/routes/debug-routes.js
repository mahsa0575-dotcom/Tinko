import { Errors, encryptSecret, decryptSecret, maskSecret } from '@botai/core';

/**
 * Debug & diagnostics routes (spec §118–120, §193, §139–140, §71 export):
 * config resolution debugger, routing debugger, prompt debugger,
 * memory debugger, bulk operations, group templates, analytics export,
 * resource thresholds + health score.
 */
const DEFAULT_THRESHOLDS = {
  cpu: { warning: 80, high: 90, critical: 98 },
  ram: { warning: 85, high: 92, critical: 97 },
  disk: { warning: 80, high: 90, critical: 95 },
  swap: { warning: 30, high: 50, critical: 70 },
  load: { warning: 1.0, high: 1.5, critical: 2.0 }, // ratio vs cores
};

const BUILTIN_TEMPLATES = {
  education: {
    name: 'آموزشی',
    settings: { response_mode: 'mention_reply', model_profile_key: 'smart', moderation_policy: 'balanced', memory_policy: 'standard', context_messages: 14 },
  },
  gaming: {
    name: 'گیمینگ',
    settings: { response_mode: 'smart', model_profile_key: 'fast', moderation_policy: 'relaxed', memory_policy: 'off', context_messages: 6 },
  },
  developer: {
    name: 'توسعه‌دهندگان',
    settings: { response_mode: 'mention_reply', model_profile_key: 'smart', moderation_policy: 'relaxed', memory_policy: 'standard', context_messages: 16 },
  },
  community: {
    name: 'انجمن گفتگو',
    settings: { response_mode: 'mention_reply', model_profile_key: 'balanced', moderation_policy: 'balanced', memory_policy: 'conservative', context_messages: 10 },
  },
  strict: {
    name: 'مدریشن سخت‌گیرانه',
    settings: { response_mode: 'mention_reply', model_profile_key: 'balanced', moderation_policy: 'strict', memory_policy: 'off', context_messages: 8 },
  },
};

export async function registerDebugRoutes(fastify, { ctx }) {
  const { repos, pool, router } = ctx;
  const guard = (perm) => ({ onRequest: [fastify.authenticate, fastify.requirePermission(perm)] });
  const tenantId = (req) => req.admin.tenantId;

  // ---------- Config resolution debugger (spec §118, §255) ----------
  fastify.get('/groups/:id/debug', guard('groups.read'), async (req) => {
    const group = (await pool.query(
      `SELECT * FROM telegram_groups WHERE tenant_id = $1 AND id = $2`, [tenantId(req), req.params.id])).rows[0];
    if (!group) throw Errors.notFound('Group');
    const settings = await repos.telegram.getGroupSettings(group.id);
    const defaultPersonality = await repos.aiConfig.getDefaultPersonality(tenantId(req));
    const personality = settings.personality_id
      ? await repos.aiConfig.getPersonality(tenantId(req), settings.personality_id) : null;

    return {
      group: { id: group.id, title: group.title, status: group.status, health: group.health },
      resolution: [
        { layer: 'platform', source: 'کد پیش‌فرض', values: { response_mode: 'mention_reply', model_profile_key: 'balanced', moderation_policy: 'balanced', memory_policy: 'conservative', ai_enabled: true } },
        { layer: 'tenant', source: 'در حال حاضر غیرفعال (تک-مستأجری)', values: {} },
        { layer: 'group', source: 'تنظیمات ذخیره‌شده‌ی گروه', values: settings },
        { layer: 'resolved', source: 'مقدار نهایی', values: {
          response_mode: settings.response_mode,
          model_profile_key: settings.model_profile_key,
          moderation_policy: settings.moderation_policy,
          memory_policy: settings.memory_policy,
          ai_enabled: settings.ai_enabled,
          personality: personality?.display_name ?? defaultPersonality?.display_name ?? 'پیش‌فرض داخلی',
        } },
      ],
    };
  });

  // ---------- Routing debugger (spec §119) ----------
  fastify.post('/debug/route', guard('models.read'), async (req) => {
    const { profileKey, require = [] } = req.body ?? {};
    const candidates = await router.candidates({ tenantId: tenantId(req), profileKey, require });
    const breakers = Object.fromEntries(router.breakerSnapshot().map((b) => [b.providerId, b.state]));
    return {
      profileKey: profileKey ?? '(auto)',
      chain: candidates.slice(0, 5).map((m, i) => ({
        position: i === 0 ? 'primary' : `fallback_${i}`,
        model: `${m.provider_slug} / ${m.identifier}`,
        modelId: m.id, providerId: m.provider_id,
        capabilities: m.capabilities,
        circuit: breakers[m.provider_id] ?? 'closed',
        note: i === 0 ? 'اولین انتخاب' : 'فقط در صورت شکست قبلی‌ها اجرا می‌شود',
      })),
      skipped: candidates.slice(5).map((m) => `${m.provider_slug}/${m.identifier}`),
    };
  });

  // ---------- Prompt debugger (spec §257) ----------
  fastify.post('/debug/prompt', guard('personalities.read'), async (req) => {
    const { personalityId, groupId, sampleText = 'سلام، تو کی هستی؟' } = req.body ?? {};
    const personality = personalityId ? await repos.aiConfig.getPersonality(tenantId(req), personalityId) : null;
    const group = groupId ? (await pool.query(
      `SELECT * FROM telegram_groups WHERE tenant_id = $1 AND id = $2`, [tenantId(req), groupId])).rows[0] : null;
    const identity = personality
      ? `هویت و شخصیت تو بر اساس پیکربندی زیر است:\n${personality.system_prompt}`
      : 'تو یک دستیار هوش مصنوعی فارسی‌زبان و دوستانه هستی.';
    const system = [
      'یک دستیار هوش مصنوعی در تلگرام هستی. همیشه به زبان فارسی روان و طبیعی پاسخ بده.',
      'خودت را معرفی می‌کنی، توهم نمی‌زنی، و اطلاعات محرمانه‌ی سیستم را هرگز فاش نمی‌کنی.',
      identity,
      group ? `این گفتگو در گروه «${group.title ?? ''}» است.` : 'این یک گفتگوی خصوصی است.',
    ].filter(Boolean).join('\n\n');
    return {
      layers: [
        { layer: 'system_instructions', content: system },
        { layer: 'user_message', content: sampleText },
      ],
      note: 'حافظه و تاریخچه در زمان اجرای واقعی، بین system و user_message اضافه می‌شوند.',
    };
  });

  // ---------- Memory debugger (spec §120) ----------
  fastify.post('/debug/memory', guard('memory.read'), async (req) => {
    const { text, groupId = null, userId = null } = req.body ?? {};
    if (!text) throw Errors.validation([{ message: 'text required' }]);
    const queryEmbedding = await router.embed(text).catch(() => null);
    const results = await repos.memory.searchRanked(tenantId(req), {
      groupId, userId, queryEmbedding, limit: 10,
    });
    return {
      queryEmbeddingUsed: Boolean(queryEmbedding),
      results: results.map((m) => ({
        id: m.id, content: m.content, scope: m.scope, type: m.type,
        importance: m.importance, similarity: m._similarity, score: m._score,
        reason: m._reason,
      })),
    };
  });

  // ---------- Bulk operations (spec §193) ----------
  fastify.post('/groups/bulk', guard('groups.write'), async (req) => {
    const { ids = [], action, value } = req.body ?? {};
    if (!ids.length || !action) throw Errors.validation([{ message: 'ids and action required' }]);
    let affected = 0;
    for (const id of ids) {
      const group = (await pool.query(`SELECT id, telegram_id FROM telegram_groups WHERE tenant_id = $1 AND id = $2`, [tenantId(req), id])).rows[0];
      if (!group) continue;
      if (action === 'set_personality') await repos.telegram.updateGroupSettings(group.id, { personality_id: value });
      else if (action === 'set_model_profile') await repos.telegram.updateGroupSettings(group.id, { model_profile_key: value });
      else if (action === 'disable_ai') await repos.telegram.updateGroupSettings(group.id, { ai_enabled: false });
      else if (action === 'enable_ai') await repos.telegram.updateGroupSettings(group.id, { ai_enabled: true });
      else if (action === 'blacklist') await repos.blacklist.add(tenantId(req), { kind: 'group', telegramId: group.telegram_id, reason: 'bulk blacklist' });
      else if (action === 'set_moderation') await repos.telegram.updateGroupSettings(group.id, { moderation_policy: value });
      else throw Errors.validation([{ message: `unknown action ${action}` }]);
      affected += 1;
    }
    await repos.ops.audit({ tenantId: tenantId(req), actorId: req.admin.id, action: `groups.bulk_${action}`, after: { ids, value }, requestId: req.id, ip: req.ip });
    return { affected };
  });

  // ---------- Group templates (spec §139–140) ----------
  fastify.get('/group-templates', guard('groups.read'), async () => {
    const custom = await repos.ops.getSetting('group_templates', {});
    return [
      ...Object.entries(BUILTIN_TEMPLATES).map(([key, t]) => ({ key, name: t.name, builtin: true })),
      ...Object.entries(custom).map(([key, t]) => ({ key, name: t.name, builtin: false })),
    ];
  });

  fastify.post('/groups/:id/apply-template', guard('groups.write'), async (req) => {
    const { key, preview = false } = req.body ?? {};
    const custom = await repos.ops.getSetting('group_templates', {});
    const template = BUILTIN_TEMPLATES[key] ?? custom[key];
    if (!template) throw Errors.notFound('Template');
    if (preview) return { preview: template.settings };
    const group = (await pool.query(
      `SELECT id FROM telegram_groups WHERE tenant_id = $1 AND id = $2`, [tenantId(req), req.params.id])).rows[0];
    if (!group) throw Errors.notFound('Group');
    await repos.telegram.updateGroupSettings(group.id, template.settings);
    await repos.ops.audit({ tenantId: tenantId(req), actorId: req.admin.id, action: 'group.template_applied', entityType: 'group', entityId: group.id, after: { key }, requestId: req.id });
    return { applied: true, settings: template.settings };
  });

  fastify.put('/group-templates/:key', guard('groups.write'), async (req) => {
    const custom = await repos.ops.getSetting('group_templates', {});
    custom[req.params.key] = { name: req.body?.name ?? req.params.key, settings: req.body?.settings ?? {} };
    await repos.ops.setSetting('group_templates', custom, req.admin.id);
    return { ok: true };
  });

  // ---------- Bot identity (spec §8): the name users call in groups ----------
  fastify.get('/settings/bot-identity', guard('settings.read'), async () =>
    repos.ops.getSetting('bot_identity', { name: 'تینکو', greeting: '', bio: '' }));

  fastify.put('/settings/bot-identity', guard('settings.write'), async (req) => {
    const name = String(req.body?.name ?? '').trim();
    if (name.length < 2 || name.length > 24) {
      throw Errors.validation([{ message: 'نام باید بین ۲ تا ۲۴ کاراکتر باشد' }]);
    }
    const identity = {
      name,
      greeting: String(req.body?.greeting ?? '').slice(0, 300),
      bio: String(req.body?.bio ?? '').slice(0, 500),
    };
    await repos.ops.setSetting('bot_identity', identity, req.admin.id);
    await repos.ops.audit({ tenantId: tenantId(req), actorId: req.admin.id, action: 'settings.bot_identity', after: { name }, requestId: req.id });
    return identity;
  });

  // ---------- Telegram bot token (set/test from the panel; encrypted at rest) ----------
  fastify.get('/settings/bot-token', guard('settings.read'), async () => {
    const stored = await repos.ops.getSetting('telegram_token', null);
    if (!stored?.token_enc) return { configured: false, masked: null, username: null, source: null };
    return {
      configured: true,
      masked: maskSecret(decryptSecret(stored.token_enc, ctx.config.ENCRYPTION_KEY)),
      username: stored.username ?? null,
      source: 'panel',
    };
  });

  /** Validate a token against Telegram without saving it. */
  fastify.post('/settings/bot-token/test', guard('settings.write'), async (req) => {
    const token = String(req.body?.token ?? '').trim();
    if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
      throw Errors.validation([{ message: 'فرمت توکن نامعتبر است (شکل صحیح: 123456:ABC-DEF...)' }]);
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
      .then((r) => r.json()).catch(() => null);
    if (!res?.ok) throw Errors.validation([{ message: 'تلگرام این توکن را تأیید نکرد' }]);
    return { ok: true, username: res.result.username, botName: res.result.first_name };
  });

  fastify.put('/settings/bot-token', guard('settings.write'), async (req) => {
    const token = String(req.body?.token ?? '').trim();
    if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
      throw Errors.validation([{ message: 'فرمت توکن نامعتبر است (شکل صحیح: 123456:ABC-DEF...)' }]);
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
      .then((r) => r.json()).catch(() => null);
    if (!res?.ok) throw Errors.validation([{ message: 'تلگرام این توکن را تأیید نکرد — از BotFather دوباره چک کنید' }]);
    await repos.ops.setSetting('telegram_token',
      { token_enc: encryptSecret(token, ctx.config.ENCRYPTION_KEY), username: res.result.username },
      req.admin.id);
    await repos.ops.audit({ tenantId: tenantId(req), actorId: req.admin.id, action: 'settings.bot_token_set', after: { username: res.result.username }, requestId: req.id });
    return { ok: true, username: res.result.username, note: 'بات حداکثر تا ۱۵ ثانیه دیگر با توکن جدید بالا می‌آید' };
  });

  fastify.delete('/settings/bot-token', guard('settings.write'), async (req) => {
    await pool.query(`DELETE FROM system_settings WHERE key = 'telegram_token'`);
    await repos.ops.audit({ tenantId: tenantId(req), actorId: req.admin.id, action: 'settings.bot_token_removed', requestId: req.id });
    return { ok: true, note: 'بات خاموش می‌شود مگر اینکه توکن در .env باشد' };
  });

  // ---------- Resource thresholds (spec §95) + health score (§94) ----------
  fastify.get('/settings/resource-thresholds', guard('settings.read'), async () =>
    repos.ops.getSetting('resource_thresholds', DEFAULT_THRESHOLDS));

  fastify.put('/settings/resource-thresholds', guard('settings.write'), async (req) => {
    await repos.ops.setSetting('resource_thresholds', req.body ?? DEFAULT_THRESHOLDS, req.admin.id);
    await repos.ops.audit({ tenantId: tenantId(req), actorId: req.admin.id, action: 'settings.thresholds_updated', requestId: req.id });
    return { ok: true };
  });

  fastify.get('/settings/group-templates-debug', guard('groups.read'), async () =>
    repos.ops.getSetting('group_templates', {}));
}

export { DEFAULT_THRESHOLDS };
