import { evaluateArithmetic, cleanSnippet } from '@botai/core';

/**
 * AI tool system (spec §61–63).
 * - Tools are OpenAI function-calling definitions executed server-side.
 * - Permission boundary: everything here is user-level; privileged tools
 *   (moderation, telegram actions) are NOT exposed to the AI.
 * - URL fetching is SSRF-guarded: no private IPs, no non-http(s), size+time caps.
 */

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'زمان و تاریخ فعلی سرور را به فارسی برمی‌گرداند',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculator',
      description: 'عبارت ریاضی (فقط اعداد و + - * / % و پرانتز) را محاسبه می‌کند',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'مثلاً (2+3)*4' } },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'محتوای متنی یک URL عمومی وب را برمی‌گرداند (فقط http/https)',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember_for_user',
      description: 'یک نکته‌ی ماندگار درباره‌ی کاربر فعلی را در حافظه ذخیره می‌کند',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string', description: 'نکته به فارسی، حداکثر ۳۰۰ کاراکتر' } },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_user_memories',
      description: 'فهرست نکات به‌یادمانده درباره‌ی کاربر فعلی را برمی‌گرداند',
      parameters: { type: 'object', properties: {} },
    },
  },
];

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?|.*\.local)$/i;

/** @returns {Promise<string>} tool output (plain text) */
export async function executeTool(name, args, { pctx, config }) {
  try {
    switch (name) {
      case 'get_current_time': {
        const formatted = new Date().toLocaleString('fa-IR', { dateStyle: 'full', timeStyle: 'short' });
        return `الان: ${formatted}`;
      }
      case 'calculator': {
        const value = evaluateArithmetic(String(args.expression ?? ''));
        return `نتیجه: ${value}`;
      }
      case 'fetch_url': {
        const url = new URL(String(args.url ?? ''));
        if (!['http:', 'https:'].includes(url.protocol)) return 'خطا: فقط http/https مجاز است';
        if (PRIVATE_HOST.test(url.hostname)) return 'خطا: دسترسی به آدرس‌های داخلی ممنوع است';
        const res = await fetch(url, {
          signal: AbortSignal.timeout(8000),
          redirect: 'follow',
          headers: { 'user-agent': 'BotAI-Tool/0.2' },
        });
        if (!res.ok) return `خطا: HTTP ${res.status}`;
        const type = res.headers.get('content-type') ?? '';
        if (!/text\/|json|xml|html/.test(type)) return 'خطا: فقط محتوای متنی پشتیبانی می‌شود';
        const buf = await res.arrayBuffer();
        return cleanSnippet(new TextDecoder().decode(buf.slice(0, 200_000)), 1500) || '(محتوای خالی)';
      }
      case 'remember_for_user': {
        const content = String(args.content ?? '').slice(0, 300);
        if (!content) return 'خطا: محتوا خالی است';
        const memory = await pctx.services.repos.memory.create(1, {
          scope: 'user', userId: pctx.tgUser.id, groupId: pctx.group?.id ?? null,
          type: 'user_preference', content, source: 'explicit', importance: 0.7, confidence: 0.9,
        });
        const embedding = pctx.services.router
          ? await pctx.services.router.embed(content).catch(() => null) : null;
        if (embedding) await pctx.services.repos.memory.update(1, memory.id, { embedding });
        return `ذخیره شد: ${content}`;
      }
      case 'list_user_memories': {
        const rows = await pctx.services.pool.query(
          `SELECT content FROM memories
           WHERE tenant_id = 1 AND user_id = $1 AND status = 'active'
           ORDER BY updated_at DESC LIMIT 10`, [pctx.tgUser.id]);
        return rows.rows.length
          ? rows.rows.map((r, i) => `${i + 1}. ${r.content}`).join('\n')
          : 'چیزی از این کاربر ذخیره نشده است';
      }
      default:
        return `ابزار ناشناخته: ${name}`;
    }
  } catch (err) {
    return `خطای اجرای ابزار: ${err.message}`;
  } finally {
    // Audit every tool invocation (spec §61)
    pctx.services.repos.ops.audit({
      tenantId: 1, actorKind: 'bot', actorId: null,
      action: 'tool.executed', entityType: 'tool', entityId: null,
      after: { tool: name, userId: pctx.tgUser?.telegram_id, groupId: pctx.group?.telegram_id },
    }).catch(() => {});
  }
}

/** Build the AI tool-calling loop messages. */
export async function runToolLoop(router, messages, result, pctx, { maxIterations = 3 } = {}) {
  let current = result;
  let conversation = messages;
  let iterations = 0;
  while (
    current.finishReason === 'tool_calls' &&
    current.raw?.choices?.[0]?.message?.tool_calls?.length &&
    iterations < maxIterations
  ) {
    const assistantMessage = current.raw.choices[0].message;
    conversation = [...conversation, assistantMessage];
    const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [assistantMessage.tool_calls];
    for (const call of toolCalls) {
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* malformed args */ }
      pctx.log?.info('tool call', { tool: call.function?.name });
      const output = await executeTool(call.function?.name, args, { pctx, config: null });
      conversation.push({ role: 'tool', tool_call_id: call.id, content: output });
    }
    current = await router.chat(conversation, pctx._aiOpts);
    iterations += 1;
  }
  return current;
}
