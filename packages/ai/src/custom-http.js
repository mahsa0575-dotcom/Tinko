import { AIProviderAdapter } from './adapter.js';
import { AIError } from './errors.js';

/**
 * Custom HTTP provider built visually in the Admin Panel.
 *
 * config: {
 *   endpoint: '/v1/chat'                      // appended to base_url
 *   method: 'POST'
 *   auth: { type: 'bearer'|'api_key_header'|'api_key_query'|'basic'|'custom',
 *           headerName?, queryName?, username?, headerValues? }
 *   bodyTemplate: '{"model":"{{model}}","messages":{{messages}},"key":"{{api_key}}"}'
 *   headersTemplate: '{"X-Custom":"{{user_id}}"}'
 *   responsePath: 'data.message.content'      // where the text lives
 *   usagePath: 'usage'                        // optional {input_tokens,output_tokens}
 * }
 *
 * Template substitution is strictly value-based: variables are inserted as
 * JSON values (messages) or JSON-escaped strings — no code execution ever.
 */

const ALLOWED_VARS = new Set([
  'api_key', 'model', 'messages', 'system_prompt', 'temperature', 'max_tokens',
  'user_id', 'group_id', 'conversation_id', 'language',
]);

/** Safe {{var}} substitution into a JSON template. */
export function renderTemplate(template, vars) {
  for (const key of Object.keys(vars)) {
    if (!ALLOWED_VARS.has(key)) throw new AIError('bad_response', `Template variable not allowed: ${key}`, { retryable: false });
  }
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, name) => {
    if (!(name in vars)) throw new AIError('bad_response', `Missing template variable: ${name}`, { retryable: false });
    const value = vars[name];
    if (name === 'messages') return JSON.stringify(value ?? []);
    return JSON.stringify(value ?? '').slice(1, -1); // JSON-escaped scalar
  });
}

/** Resolve a dotted path in a parsed JSON object: 'data.message.content'. */
export function extractPath(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}

/** Extract content per template-aware rules. */
export function extractResponse(json, responsePath) {
  const value = extractPath(json, responsePath);
  if (typeof value === 'string') return value;
  if (value == null) {
    // OpenAI-style fallback
    const fallback = extractPath(json, 'choices.0.message.content');
    if (typeof fallback === 'string') return fallback;
    throw new AIError('bad_response', `Response path "${responsePath}" not found in provider response`, { retryable: false });
  }
  if (Array.isArray(value)) return value.map(String).join('\n');
  return JSON.stringify(value);
}

export class CustomHttpAdapter extends AIProviderAdapter {
  get capabilities() {
    return new Set(this.config.capabilities ?? ['chat']);
  }

  #buildHeaders(req, ctx) {
    const headers = { 'content-type': 'application/json' };
    const auth = this.config.auth ?? { type: 'bearer' };
    const key = ctx.apiKey ?? '';
    switch (auth.type) {
      case 'bearer': headers.authorization = `Bearer ${key}`; break;
      case 'api_key_header': headers[auth.headerName ?? 'x-api-key'] = key; break;
      case 'basic': headers.authorization = `Basic ${Buffer.from(`${auth.username ?? ''}:${key}`).toString('base64')}`; break;
      case 'custom': Object.assign(headers, auth.headerValues ?? {}); break;
      case 'none': break;
      default: throw new AIError('bad_response', `Unknown auth type: ${auth.type}`, { retryable: false });
    }
    if (this.config.headersTemplate) {
      const rendered = renderTemplate(this.config.headersTemplate, {
        model: req.model, user_id: ctx.userId ?? '', group_id: ctx.groupId ?? '',
        conversation_id: ctx.conversationId ?? '', language: ctx.language ?? '',
      });
      Object.assign(headers, JSON.parse(rendered));
    }
    return headers;
  }

  #buildBody(req, ctx) {
    if (this.config.bodyTemplate) {
      const rendered = renderTemplate(this.config.bodyTemplate, {
        api_key: ctx.apiKey ?? '',
        model: req.model,
        messages: req.messages,
        system_prompt: req.messages.find((m) => m.role === 'system')?.content ?? '',
        temperature: req.temperature ?? null,
        max_tokens: req.maxTokens ?? null,
        user_id: ctx.userId ?? '',
        group_id: ctx.groupId ?? '',
        conversation_id: ctx.conversationId ?? '',
        language: ctx.language ?? '',
      });
      try {
        return JSON.parse(rendered);
      } catch (err) {
        throw new AIError('bad_response', `Rendered body is not valid JSON: ${err.message}`, { retryable: false });
      }
    }
    return { model: req.model, messages: req.messages };
  }

  async chat(req, ctx) {
    const method = (this.config.method ?? 'POST').toUpperCase();
    let url = `${(this.baseUrl ?? '').replace(/\/$/, '')}${this.config.endpoint ?? ''}`;
    const auth = this.config.auth ?? {};
    if (auth.type === 'api_key_query') {
      url += (url.includes('?') ? '&' : '?') + `${encodeURIComponent(auth.queryName ?? 'api_key')}=${encodeURIComponent(ctx.apiKey ?? '')}`;
    }
    const body = this.#buildBody(req, ctx);
    const json = method === 'GET'
      ? await this.requestJson({ url, headers: this.#buildHeaders(req, ctx), body: {}, signal: ctx.signal })
      : await this.requestJson({ url, headers: this.#buildHeaders(req, ctx), body, signal: ctx.signal });

    const content = extractResponse(json, this.config.responsePath);
    const usageRaw = extractPath(json, this.config.usagePath ?? '') ?? {};
    return {
      content,
      usage: {
        inputTokens: Number(usageRaw.input_tokens ?? usageRaw.promptTokens ?? 0) || 0,
        outputTokens: Number(usageRaw.output_tokens ?? usageRaw.completionTokens ?? 0) || 0,
      },
      finishReason: 'stop',
      raw: json,
    };
  }
}
