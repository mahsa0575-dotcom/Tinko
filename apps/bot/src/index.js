import { Bot, GrammyError, HttpError } from 'grammy';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { loadConfig, createLogger, setLogLevel, encryptSecret, decryptSecret, maskSecret, newRequestId } from '@botai/core';
import { createPool, createRepos } from '@botai/db';
import { createAiRouter } from '@botai/ai';
import { createProfanityEngine, textMentionsName } from './moderation/persian.js';
import { createAntiSpam } from './moderation/anti-spam.js';
import {
  createPipeline, dedupeStage, resolutionStage, rateLimitStage, moderationStage,
  antiSpamStage, aiModerationStage, mediaStage, relevanceStage, contextStage,
  memoryCommandsStage, personalityStage, typingStage, aiStage, respondStage,
  memoryEnqueueStage, escapeHtml,
} from './pipeline.js';
import { texts } from './texts.js';

/**
 * Telegram bot worker.
 * Runs the full message pipeline for every update, in polling (dev) or
 * webhook (production) mode. Designed to run as its own process/container.
 */
export async function startBot(overrides = {}) {
  const config = overrides.config ?? loadConfig();
  setLogLevel(config.LOG_LEVEL);
  const log = overrides.logger ?? createLogger({ service: 'bot' });

  if (!config.TELEGRAM_BOT_TOKEN) {
    log.warn('TELEGRAM_BOT_TOKEN is empty — bot process is idle (API-only deployment)');
    return null;
  }

  const pool = overrides.pool ?? createPool(config);
  const repos = overrides.repos ?? createRepos(pool, {
    encrypt: (s) => encryptSecret(s, config.ENCRYPTION_KEY),
    decrypt: (s) => decryptSecret(s, config.ENCRYPTION_KEY),
    mask: maskSecret,
  });
  const redis = overrides.redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3 });
  const router = overrides.router ?? createAiRouter({ aiConfigRepo: repos.aiConfig, opsRepo: repos.ops, logger: log });

  // ---- token resolution: panel (DB, encrypted) wins over .env ----
  async function resolveBotToken() {
    try {
      const stored = await repos.ops.getSetting('telegram_token', null);
      if (stored?.token_enc) {
        return { token: decryptSecret(stored.token_enc, config.ENCRYPTION_KEY), source: 'panel' };
      }
    } catch { /* DB not ready — fall through */ }
    if (config.TELEGRAM_BOT_TOKEN) return { token: config.TELEGRAM_BOT_TOKEN, source: 'env' };
    return null;
  }

  const resolved = await resolveBotToken().catch(() => null);
  if (!resolved) {
    log.warn('هیچ توکن باتی تنظیم نشده — بات در حالت انتظار است. توکن را از پنل مدیریت (شخصیت‌ها → اتصال تلگرام) ست کنید.');
    const waitTimer = setInterval(async () => {
      const found = await resolveBotToken().catch(() => null);
      if (found) {
        log.info('توکن پیدا شد — بات راه‌اندازی مجدد می‌شود');
        process.exit(0); // container restart policy brings it up with the token
      }
    }, 15_000);
    process.on('SIGINT', () => { clearInterval(waitTimer); process.exit(0); });
    process.on('SIGTERM', () => { clearInterval(waitTimer); process.exit(0); });
    return null;
  }
  const botToken = resolved.token;
  log.info('bot token resolved', { source: resolved.source });

  const bot = new Bot(botToken, { client: { canUseWebhookReply: () => false } });
  const me = await bot.api.getMe();
  const username = me.username;
  log.info('bot authorized', { username, id: me.id });

  // Live token watcher: panel change/remove → restart with the new token (≤15s).
  const tokenWatcher = setInterval(async () => {
    const current = await resolveBotToken().catch(() => null);
    if (!current || current.token !== botToken) {
      log.info('توکن بات تغییر کرد — راه‌اندازی مجدد…');
      process.exit(0);
    }
  }, 15_000);

  // ---- configurable bot identity (spec §8): the name users call in groups ----
  const DEFAULT_IDENTITY = { name: 'تینکو', greeting: '', bio: '' };
  let identity = { ...DEFAULT_IDENTITY };
  let maintenanceMode = false;
  async function loadIdentity() {
    try {
      const stored = await repos.ops.getSetting('bot_identity', null);
      if (stored?.name) identity = { ...DEFAULT_IDENTITY, ...stored };
      const mm = await repos.ops.getSetting('maintenance_mode', { enabled: false });
      maintenanceMode = Boolean(mm?.enabled ?? mm);
    } catch { /* keep previous */ }
  }
  await loadIdentity();
  const identityTimer = setInterval(loadIdentity, 60_000); // panel edits apply within a minute

  // ---- admin commands (Telegram management menu) ----
  bot.command('start', async (ctx) => {
    await ctx.reply(ctx.chat.type === 'private' ? texts.welcome : texts.addedToGroup);
  });
  bot.command('help', async (ctx) => ctx.reply(texts.helpPrivate));

  bot.command('settings', async (ctx) => {
    if (ctx.chat.type === 'private') {
      await ctx.reply('برای مدیریت گروه، این دستور را داخل خود گروه ارسال کنید.');
      return;
    }
    const member = await ctx.getChatMember(ctx.from.id).catch(() => null);
    const isAdmin = member && (member.status === 'creator' || member.status === 'administrator');
    if (!isAdmin) {
      await ctx.reply(texts.notGroupAdmin);
      return;
    }
    const group = await repos.telegram.upsertGroup(1, ctx.chat);
    const settings = await repos.telegram.getGroupSettings(group.id);
    const personality = settings.personality_id
      ? await repos.aiConfig.getPersonality(1, settings.personality_id) : null;
    await ctx.reply(
      `${texts.settingsHeader}\n` +
      `━━━━━━━━━━━━━━\n` +
      `🤖 هوش مصنوعی: ${settings.ai_enabled ? 'فعال ✅' : 'غیرفعال ❌'}\n` +
      `🧩 پروفایل مدل: ${settings.model_profile_key ?? 'balanced'}\n` +
      `🎭 شخصیت: ${personality?.display_name ?? 'پیش‌فرض'}\n` +
      `💬 حالت پاسخ: ${settings.response_mode}\n` +
      `🛡 سیاست مدیریت: ${settings.moderation_policy}\n` +
      `🧠 حافظه: ${settings.memory_policy}\n` +
      `━━━━━━━━━━━━━━\n` +
      `مدیران می‌توانند تنظیمات کامل را در پنل مدیریت تغییر دهند.`
    );
    // Sync admins for group-admin verification (spec §37)
    const admins = await ctx.getChatAdministrators().catch(() => []);
    await repos.telegram.syncGroupAdmins(group.id, admins);
  });

  // ---- anti-raid: join-spike detection on chat_member updates (spec §50) ----
  bot.on('chat_member', async (ctx) => {
    const cm = ctx.chatMember;
    if (cm.new_chat_member?.status === 'member' && ['left', 'kicked'].includes(cm.old_chat_member?.status)) {
      const group = await repos.telegram.upsertGroup(1, ctx.chat).catch(() => null);
      if (!group) return;
      const settings = await repos.telegram.getGroupSettings(group.id);
      const raid = await antiSpam.checkRaid(group.id, settings.moderation_policy);
      if (raid.triggered) {
        await antiSpam.activateRaidMode(group.id, 600);
        await repos.moderation.recordEvent(1, {
          groupId: group.id, category: 'raid', severity: 'critical', action: 'escalate',
          detail: { joinsPerMinute: raid.count, threshold: raid.threshold },
        });
        await repos.ops.notify(1, {
          level: 'critical',
          title: `حمله‌ی احتمالی به گروه «${ctx.chat.title ?? group.id}»`,
          body: `${raid.count} عضو در یک دقیقه اضافه شدند. حالت اضطراری برای ۱۰ دقیقه فعال شد.`,
          dedupKey: `raid:${group.id}`,
        }).catch(() => {});
        await ctx.reply('🚨 ورود غیرعادی اعضا شناسایی شد؛ حالت سخت‌گیرانه موقتاً فعال است.').catch(() => {});
      }
      // user_joined automations
      try {
        const { rows } = await pool.query(
          `SELECT * FROM automations
           WHERE enabled AND group_id = $1 AND trigger->>'type' = 'user_joined'`, [group.id]);
        for (const automation of rows) {
          if (automation.action?.type === 'send_message' && automation.action?.text) {
            const text = automation.action.text.replaceAll('{name}', cm.new_chat_member?.user?.first_name ?? '');
            await ctx.reply(text).catch(() => {});
            await pool.query(
              `INSERT INTO automation_runs (automation_id, status) VALUES ($1,'success')`, [automation.id]);
          }
        }
      } catch { /* best effort */ }
    }
  });

  bot.on('my_chat_member', async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    if (['left', 'kicked'].includes(status)) {
      await repos.telegram.markGroupLeft(1, ctx.chat.id);
      log.info('bot removed from group', { chat: ctx.chat.id });
    } else if (status === 'member' || status === 'administrator') {
      const group = await repos.telegram.upsertGroup(1, ctx.chat);
      log.info('bot added to group', { chat: ctx.chat.id, groupRow: group.id });
    }
  });

  // ---- message pipeline wiring ----
  const profanity = createProfanityEngine();
  const antiSpam = createAntiSpam(redis);
  const queues = { ai: new Queue('ai', { connection: redis.duplicate() }) };
  const featureFlags = await loadFeatureFlags(pool);
  const pipeline = createPipeline([
    dedupeStage(redis),
    resolutionStage(repos),
    rateLimitStage(redis),
    mediaStage({ router }),
    moderationStage({ repos, profanity }),
    antiSpamStage({ antiSpam, repos }),
    aiModerationStage({ router, repos, featureFlags }),
    relevanceStage(),
    contextStage({ repos }),
    memoryCommandsStage({ repos, services: { pool, router } }),
    personalityStage({ repos }),
    typingStage(),
    aiStage({ router }),
    respondStage(),
    memoryEnqueueStage({ queues }),
  ]);

  bot.on(['message', 'edited_message', 'channel_post'], async (ctx) => {
    const message = ctx.message ?? ctx.editedMessage ?? ctx.channelPost;
    if (!message?.from || message.from.is_bot) return;
    const text = message.text ?? message.caption ?? '';

    // Maintenance mode (spec §154): only the platform owner gets through.
    if (maintenanceMode && String(message.from.id) !== String(config.PLATFORM_OWNER_TELEGRAM_ID ?? '')) {
      await ctx.reply(texts.maintenance).catch(() => {});
      return;
    }

    // --- mention / reply / name-call detection ---
    const entities = message.entities ?? message.caption_entities ?? [];
    const nameCalled = textMentionsName(text, identity.name);
    const mentioned =
      nameCalled ||
      entities.some((e) => e.type === 'mention' && text.slice(e.offset, e.offset + e.length).toLowerCase() === `@${username.toLowerCase()}`) ||
      entities.some((e) => e.type === 'text_mention' && e.user?.id === me.id) ||
      (ctx.chat.type === 'private');
    const replyToBot = Boolean(
      message.reply_to_message?.from?.id === me.id ||
      message.reply_to_message?.reply_to_message?.from?.id === me.id);

    const command = entities.find((e) => e.type === 'bot_command')?.length
      ? text.slice(entities.find((e) => e.type === 'bot_command').offset + 1,
        entities.find((e) => e.type === 'bot_command').offset + entities.find((e) => e.type === 'bot_command').length).split('@')[0]
      : null;

    const pctx = {
      update: ctx.update, message, chat: ctx.chat, from: message.from, text,
      mentioned, replyToBot, command, nameCalled,
      identity,
      services: { pool, repos, redis, router },
      log: log.child({ request_id: newRequestId(), chat_id: ctx.chat.id, user_id: message.from.id }),
      reply: (content, opts = {}) => ctx.reply(escapeHtml(content), {
        parse_mode: 'HTML',
        // In groups, answer the person directly (spec §53): reply to their message.
        reply_to_message_id: ctx.chat.type !== 'private' ? message.message_id : undefined,
        ...opts,
      }),
      sendChatAction: (action = 'typing') => ctx.replyWithChatAction(action),
      deleteMessage: () => ctx.deleteMessage(),
      deleteMessageId: (messageId) => ctx.api.deleteMessage(ctx.chat.id, messageId),
      editMessage: (msg, text) => ctx.api.editMessageText(ctx.chat.id, msg.message_id, text, {
        link_preview_options: { is_disabled: true },
      }),
      /** Download a Telegram file (photo/voice) as base64 — capped at ~20MB. */
      downloadFile: async (fileId) => {
        const file = await ctx.api.getFile(fileId);
        if ((file.file_size ?? 0) > 20 * 1024 * 1024) throw new Error('file too large');
        const url = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`file download failed: HTTP ${res.status}`);
        return Buffer.from(await res.arrayBuffer()).toString('base64');
      },
      muteMember: (seconds) => ctx.restrictChatMember(ctx.from.id, {
        can_send_messages: false,
      }, { until_date: Math.floor(Date.now() / 1000) + seconds }),
      banMember: () => ctx.banChatMember(ctx.from.id),
      streamingEnabled: true,
    };
    await runMessageAutomations(pctx); // keyword automations (spec §74)
    await pipeline(pctx);
  });

  // Global error handler: log everything, never crash the worker.
  bot.catch((err) => {
    const { name, message, stack } = err.error ?? err;
    if (err instanceof GrammyError) log.error('telegram api error', { name, message });
    else if (err instanceof HttpError) log.error('telegram http error', { name, message });
    else log.error('bot unhandled error', { name, message, stack });
  });

  // ---- start (polling or webhook) ----
  await repos.ops.heartbeat('bot', new Date()).catch(() => {});
  const hb = setInterval(() => repos.ops.heartbeat('bot').catch(() => {}), 30_000);

  if (config.TELEGRAM_MODE === 'webhook') {
    // Dedicated lightweight webhook receiver in the bot process itself.
    // In production the reverse proxy routes {PUBLIC_BASE_URL}{path} to this port.
    const { createServer } = await import('node:http');
    const port = config.BOT_WEBHOOK_PORT ?? 8081;
    const server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === config.TELEGRAM_WEBHOOK_PATH) {
        if (config.TELEGRAM_WEBHOOK_SECRET &&
          req.headers['x-telegram-bot-api-secret-token'] !== config.TELEGRAM_WEBHOOK_SECRET) {
          res.writeHead(401).end();
          return;
        }
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
        req.on('end', () => {
          res.writeHead(200).end('ok');
          try { bot.handleUpdate(JSON.parse(body)).catch((e) => log.error('webhook update failed', { error: e.message })); }
          catch { /* malformed body already answered */ }
        });
      } else if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'ok' }));
      } else {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(port, resolve));
    await bot.api.setWebhook(`${config.PUBLIC_BASE_URL}${config.TELEGRAM_WEBHOOK_PATH}`, {
      secret_token: config.TELEGRAM_WEBHOOK_SECRET || undefined,
      drop_pending_updates: true,
    });
    log.info('webhook receiver listening', { port, url: `${config.PUBLIC_BASE_URL}${config.TELEGRAM_WEBHOOK_PATH}` });
    overrides._webhookServer = server;
  } else {
    await bot.api.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
    log.info('starting long polling');
    // errors caught above; polling continues
    bot.start({ drop_pending_updates: false });
  }

  const shutdown = async () => {
    log.info('bot shutting down');
    clearInterval(hb);
    clearInterval(identityTimer);
    clearInterval(tokenWatcher);
    await bot.stop().catch(() => {});
    if (overrides._webhookServer) await new Promise((r) => overrides._webhookServer.close(r));
    await repos.ops.markOffline('bot').catch(() => {});
    await pool.end().catch(() => {});
    await redis.quit().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { bot, ctx: { config, pool, repos, redis, router } };
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  startBot().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

/** Load runtime feature flags from DB with safe defaults (spec §155). */
async function loadFeatureFlags(pool) {
  const defaults = {
    vision_enabled: true, audio_enabled: true, memory_enabled: true,
    web_search_enabled: false, ai_moderation_enabled: false,
  };
  try {
    const { rows } = await pool.query(`SELECT key, value FROM feature_flags`);
    for (const row of rows) {
      if (row.value && typeof row.value.global === 'boolean') defaults[row.key] = row.value.global;
    }
  } catch { /* defaults */ }
  return defaults;
}

/**
 * Message-triggered automations (spec §74): keyword triggers defined in the
 * panel fire immediately without AI. `user_joined` triggers run from the
 * chat_member handler.
 */
async function runMessageAutomations(pctx) {
  if (!pctx.group || !pctx.text) return;
  try {
    const { rows } = await pctx.services.pool.query(
      `SELECT a.*, g.telegram_id AS tg_chat_id
       FROM automations a JOIN telegram_groups g ON g.id = a.group_id
       WHERE a.enabled AND a.trigger->>'type' = 'message' AND a.group_id = $1`,
      [pctx.group.id]);
    for (const automation of rows) {
      const pattern = automation.trigger?.match;
      if (!pattern || !new RegExp(pattern, 'i').test(pctx.text)) continue;
      await pctx.services.repos.ops.audit({
        tenantId: 1, actorKind: 'bot', action: 'automation.triggered',
        entityType: 'automation', entityId: automation.id,
      }).catch(() => {});
      if (automation.action?.type === 'send_message' && automation.action?.text) {
        await pctx.reply(automation.action.text).catch(() => {});
      }
      await pctx.services.pool.query(
        `INSERT INTO automation_runs (automation_id, status, detail) VALUES ($1,'success','{}')`,
        [automation.id]);
    }
  } catch (err) {
    pctx.log?.debug('message automations skipped', { error: err.message });
  }
}
