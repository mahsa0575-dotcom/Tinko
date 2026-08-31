import { AIProviderAdapter } from './adapter.js';
import { AIError } from './errors.js';

/**
 * Anthropic Messages API adapter (api.anthropic.com/v1/messages).
 * Request/response shape differs from OpenAI; the router sees no difference.
 */
export class AnthropicAdapter extends AIProviderAdapter {
  get capabilities() {
    return new Set(['chat', 'streaming', 'vision', 'tools']);
  }

  /**
   * Convert OpenAI-style vision content parts (data-URL images) into
   * Anthropic's native content blocks so the router format stays uniform.
   */
  #normalizeContent(content) {
    if (typeof content === 'string' || !Array.isArray(content)) return content;
    return content.map((part) => {
      const url = part?.image_url?.url;
      if (part?.type === 'image_url' && url?.startsWith('data:')) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
        }
      }
      return { type: 'text', text: part?.text ?? String(part) };
    });
  }

  #headers(apiKey) {
    return {
      'x-api-key': apiKey,
      'anthropic-version': this.config.apiVersion ?? '2023-06-01',
      ...(this.config.defaultHeaders ?? {}),
    };
  }

  /**
   * Anthropic exposes GET /v1/models. It reports no context window, so the
   * documented per-family limit is applied instead of leaving the field blank.
   */
  async listRemoteModels(ctx = {}) {
    if (!ctx.apiKey) throw new AIError('auth', 'برای دریافت فهرست مدل‌ها ابتدا یک کلید API ثبت کنید', { retryable: false });
    const url = `${this.#base()}/v1/models?limit=200`;
    const json = await this.requestJsonGet({ url, headers: this.#headers(ctx.apiKey), signal: ctx.signal });
    const models = (json.data ?? []).map((m) => {
      const id = String(m.id ?? '');
      return {
        identifier: id,
        display_name: m.display_name ?? id,
        description: '',
        // Documented Anthropic context windows (the API omits them).
        context_window: /claude-(sonnet-4|opus-4|3-7)/.test(id) ? 200_000
          : /claude-3-5/.test(id) ? 200_000
          : /claude-3/.test(id) ? 200_000 : null,
        max_output: /claude-(sonnet-4|3-7)/.test(id) ? 64_000 : 8_192,
        input_price: null, output_price: null,
        capabilities: ['chat', 'streaming', 'vision', 'tools'],
        owned_by: 'anthropic',
        created: m.created_at ?? null,
      };
    }).filter((m) => m.identifier);
    return { supported: true, models };
  }

  #base() {
    return (this.baseUrl ?? 'https://api.anthropic.com').replace(/\/+$/, '');
  }

  async chat(req, ctx) {
    if (!ctx.apiKey) throw new AIError('auth', 'No API key configured for this provider', { retryable: false });
    const url = `${this.#base()}/v1/messages`;

    // Anthropic requires the system prompt separately and roles user/assistant only.
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: this.#normalizeContent(m.content) }));

    const body = {
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      messages,
      ...(system ? { system } : {}),
      ...(req.temperature != null ? { temperature: req.temperature } : {}),
    };
    const json = await this.requestJson({ url, headers: this.#headers(ctx.apiKey), body, signal: ctx.signal });

    const text = (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    return {
      content: text,
      usage: { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0 },
      finishReason: json.stop_reason ?? 'stop',
      raw: json,
    };
  }
}
