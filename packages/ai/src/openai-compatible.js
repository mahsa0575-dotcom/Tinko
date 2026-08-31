import { AIProviderAdapter } from './adapter.js';
import { AIError, classifyHttpError, wrapNetworkError as wrapNetwork } from './errors.js';

/**
 * Works with OpenAI, DeepSeek, Groq, OpenRouter, Together, Fireworks,
 * Mistral, Ollama and any OpenAI-compatible service.
 *
 * config: {
 *   chatPath: '/chat/completions' (default)
 *   defaultHeaders: {}
 * }
 */
export class OpenAICompatibleAdapter extends AIProviderAdapter {
  get capabilities() {
    return new Set(['chat', 'streaming', 'embeddings', 'audio', 'tools', 'vision']);
  }

  #headers(apiKey) {
    const headers = { ...(this.config.defaultHeaders ?? {}) };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    return headers;
  }

  async chat(req, ctx) {
    if (!ctx.apiKey) throw new AIError('auth', 'No API key configured for this provider', { retryable: false });
    const url = `${(this.baseUrl ?? '').replace(/\/$/, '')}${this.config.chatPath ?? '/chat/completions'}`;
    const body = {
      model: req.model,
      messages: req.messages,
      ...(req.temperature != null ? { temperature: req.temperature } : {}),
      ...(req.maxTokens != null ? { max_tokens: req.maxTokens } : {}),
      ...(req.tools?.length ? { tools: req.tools } : {}),
    };
    const json = await this.requestJson({ url, headers: this.#headers(ctx.apiKey), body, signal: ctx.signal });

    const choice = json.choices?.[0];
    if (!choice) throw new AIError('bad_response', 'Response missing choices[0]', { retryable: false });
    return {
      content: choice.message?.content ?? '',
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
      finishReason: choice.finish_reason ?? 'stop',
      raw: json,
    };
  }

  async embeddings(req, ctx) {
    const url = `${(this.baseUrl ?? '').replace(/\/$/, '')}/embeddings`;
    const json = await this.requestJson({
      url, headers: this.#headers(ctx.apiKey),
      body: { model: req.model, input: req.input }, signal: ctx.signal,
    });
    return { embeddings: json.data?.map((d) => d.embedding) ?? [] };
  }

  /**
   * Speech-to-text (OpenAI /audio/transcriptions style, whisper-compatible).
   * @returns {Promise<{text:string}>}
   */
  async transcribe(req, ctx) {
    if (!ctx.apiKey) throw new AIError('auth', 'No API key configured for this provider', { retryable: false });
    const url = `${(this.baseUrl ?? '').replace(/\/$/, '')}/audio/transcriptions`;
    const timeout = AbortSignal.timeout(this.timeoutMs * 2);
    const form = new FormData();
    const bytes = Buffer.from(req.audioBase64, 'base64');
    form.append('file', new Blob([bytes], { type: req.mimeType ?? 'audio/ogg' }), req.filename ?? 'audio.ogg');
    form.append('model', req.model ?? this.config.sttModel ?? 'whisper-1');
    if (req.language) form.append('language', req.language);
    let res;
    try {
      res = await this.fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${ctx.apiKey}` },
        body: form, signal: ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout,
      });
    } catch (err) {
      throw wrapNetwork(err);
    }
    if (!res.ok) throw classifyHttpError(res.status, await res.text().catch(() => ''));
    const json = await res.json();
    return { text: json.text ?? '' };
  }

  /**
   * Streaming chat (SSE). Yields content deltas.
   * Throws before/after starting based on provider behavior; the router
   * treats a pre-first-delta failure as routable, a mid-stream failure as fatal.
   */
  async *chatStream(req, ctx) {
    if (!ctx.apiKey) throw new AIError('auth', 'No API key configured for this provider', { retryable: false });
    const url = `${(this.baseUrl ?? '').replace(/\/$/, '')}${this.config.chatPath ?? '/chat/completions'}`;
    const body = {
      model: req.model, messages: req.messages, stream: true,
      ...(req.temperature != null ? { temperature: req.temperature } : {}),
      ...(req.maxTokens != null ? { max_tokens: req.maxTokens } : {}),
    };
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const res = await this.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.#headers(ctx.apiKey) },
      body: JSON.stringify(body),
      signal: ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout,
    }).catch((err) => { throw wrapNetwork(err); });
    if (!res.ok) throw classifyHttpError(res.status, await res.text().catch(() => ''));

    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch { /* partial line, ignore */ }
      }
    }
  }

  async healthCheck(ctx) {
    const start = Date.now();
    try {
      await this.chat({ model: ctx.model ?? 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }], maxTokens: 1 }, ctx);
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message };
    }
  }
}
