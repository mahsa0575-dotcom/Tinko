/**
 * Automation engine — time triggers (spec §73–74).
 * Message/user_joined triggers fire inside the bot; here we tick every minute
 * and run due time-based automations with run history (automation_runs).
 *
 * Trigger shapes:
 *   { type:'time', everyMinutes: 60 }
 *   { type:'time', dailyAt: '09:30' }   (server timezone)
 * Action shapes:
 *   { type:'send_message', target:'group'|'owner', text }
 *   { type:'notify_admin', title, body }
 *   { type:'disable_ai', groupId? }     (defaults to automation.group_id)
 */
export async function runAutomations(ctx) {
  const { pool, repos, config, logger } = ctx;
  const { rows } = await pool.query(
    `SELECT a.*, g.telegram_id AS group_telegram_id
     FROM automations a LEFT JOIN telegram_groups g ON g.id = a.group_id
     WHERE a.enabled AND a.trigger->>'type' = 'time'`);

  let executed = 0;
  for (const automation of rows) {
    if (!isDue(automation)) continue;
    try {
      await executeAction(ctx, automation);
      await pool.query(`UPDATE automations SET last_run_at = now() WHERE id = $1`, [automation.id]);
      await pool.query(`INSERT INTO automation_runs (automation_id, status) VALUES ($1, 'success')`, [automation.id]);
      executed += 1;
    } catch (err) {
      logger.warn('automation failed', { id: automation.id, error: err.message });
      await pool.query(
        `INSERT INTO automation_runs (automation_id, status, detail) VALUES ($1, 'failed', $2)`,
        [automation.id, JSON.stringify({ error: err.message })]);
    }
  }
  return { executed, evaluated: rows.length };
}

function isDue(automation) {
  const trigger = automation.trigger ?? {};
  const everyMinutes = Number(trigger.everyMinutes || 0);
  if (everyMinutes > 0) {
    return !automation.last_run_at ||
      Date.now() - new Date(automation.last_run_at).getTime() >= everyMinutes * 60_000;
  }
  if (trigger.dailyAt) {
    const [h, m] = String(trigger.dailyAt).split(':').map(Number);
    const now = new Date();
    const last = automation.last_run_at ? new Date(automation.last_run_at) : null;
    return now.getHours() === h && now.getMinutes() >= m &&
      (!last || last.getDate() !== now.getDate() || last.getMonth() !== now.getMonth());
  }
  return false;
}

async function executeAction(ctx, automation) {
  const { pool, repos, config } = ctx;
  const action = automation.action ?? {};
  switch (action.type) {
    case 'send_message': {
      const text = String(action.text ?? '');
      if (action.target === 'owner') {
        if (config.PLATFORM_OWNER_TELEGRAM_ID) {
          await sendTelegram(config.TELEGRAM_BOT_TOKEN, config.PLATFORM_OWNER_TELEGRAM_ID, text);
        }
      } else if (automation.group_telegram_id) {
        await sendTelegram(config.TELEGRAM_BOT_TOKEN, automation.group_telegram_id, text);
      }
      break;
    }
    case 'notify_admin': {
      await repos.ops.notify(1, {
        level: 'info', title: action.title ?? automation.name, body: action.body ?? '',
        dedupKey: `automation:${automation.id}:${new Date().toISOString().slice(0, 10)}`,
      });
      if (config.PLATFORM_OWNER_TELEGRAM_ID && config.TELEGRAM_BOT_TOKEN) {
        await sendTelegram(config.TELEGRAM_BOT_TOKEN, config.PLATFORM_OWNER_TELEGRAM_ID,
          `🔔 ${action.title ?? automation.name}\n${action.body ?? ''}`).catch(() => {});
      }
      break;
    }
    case 'disable_ai': {
      if (automation.group_id) await repos.telegram.updateGroupSettings(automation.group_id, { ai_enabled: false });
      break;
    }
    case 'change_config': {
      if (automation.group_id && action.settings) {
        await repos.telegram.updateGroupSettings(automation.group_id, action.settings);
      }
      break;
    }
    default:
      throw new Error(`unknown automation action: ${action.type}`);
  }
  void pool;
}

async function sendTelegram(token, chatId, text) {
  if (!token || !chatId) throw new Error('telegram token/chatId unavailable');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`telegram sendMessage failed: HTTP ${res.status}`);
}
