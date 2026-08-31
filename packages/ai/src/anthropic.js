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

  async chat(req, ctx) {
    if (!ctx.apiKey) throw new AIError('auth', 'No API key configured for this provider', { retryable: false });
    const url = `${(this.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`;

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
