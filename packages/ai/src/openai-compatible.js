import { AIProviderAdapter } from './adapter.js';
import { AIError, classifyHttpError, wrapNetworkError as wrapNetwork } from './errors.js';

/**
 * Works with OpenAI, DeepSeek, Groq, OpenRouter, Together, Fireworks,
 * Mistral, Ollama and any OpenAI-compatible service.
 *
 * config: {
 *   chatPath: '/chat/completions' (default; /v1 is added when base_url lacks it)
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
    const url = openAiUrl(this.baseUrl, this.config.chatPath ?? '/chat/completions');
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

  /**
   * Model discovery via GET /v1/models — the OpenAI catalogue endpoint, also
   * implemented by DeepSeek, Groq, OpenRouter, Together, Mistral and Ollama.
   * Normalizes the provider-specific extras (context length, pricing,
   * modalities) so the panel can pre-fill the registration form.
   */
  async listRemoteModels(ctx = {}) {
    const url = openAiUrl(this.baseUrl, this.config.modelsPath ?? '/models');
    const json = await this.requestJsonGet({ url, headers: this.#headers(ctx.apiKey), signal: ctx.signal });
    const raw = Array.isArray(json) ? json : (json.data ?? json.models ?? []);
    const models = raw
      .map((m) => normalizeRemoteModel(m))
      .filter((m) => m.identifier)
      .sort((a, b) => a.identifier.localeCompare(b.identifier));
    return { supported: true, models };
  }

  async embeddings(req, ctx) {
    const url = openAiUrl(this.baseUrl, '/embeddings');
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
    const url = openAiUrl(this.baseUrl, '/audio/transcriptions');
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
    const url = openAiUrl(this.baseUrl, this.config.chatPath ?? '/chat/completions');
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

/**
 * Map one catalogue entry onto the shape the `models` table expects.
 * Different vendors nest the same facts differently, so every field is probed
 * across the known aliases and left null when the provider stays silent —
 * the panel shows "—" rather than inventing a value.
 */
export function normalizeRemoteModel(m) {
  const identifier = String(m.id ?? m.name ?? m.model ?? '').trim();
  const contextWindow = firstNumber([
    m.context_length, m.context_window, m.max_context_length,
    m.top_provider?.context_length, m.limits?.max_context_tokens,
  ]);
  const maxOutput = firstNumber([
    m.max_output_tokens, m.max_completion_tokens,
    m.top_provider?.max_completion_tokens, m.limits?.max_output_tokens,
  ]);
  // OpenRouter reports per-token USD prices as strings; convert to per-1M tokens.
  const perToken = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 1_000_000 * 1e6) / 1e6 : null;
  };

  const modalities = [
    ...(m.architecture?.input_modalities ?? []),
    ...(m.architecture?.modality ? String(m.architecture.modality).split(/[->+,]/) : []),
  ].map((s) => s.trim().toLowerCase());

  const capabilities = new Set(['chat', 'streaming']);
  const idLower = identifier.toLowerCase();
  if (modalities.includes('image') || /vision|-vl|4o|gemini|claude-3|llava/.test(idLower)) capabilities.add('vision');
  if (modalities.includes('audio') || /whisper|audio|transcribe/.test(idLower)) capabilities.add('audio');
  if (/embed/.test(idLower)) { capabilities.delete('chat'); capabilities.delete('streaming'); capabilities.add('embeddings'); }
  if (m.supported_parameters?.includes?.('tools') || /gpt-4|gpt-5|claude|deepseek|qwen|llama-3/.test(idLower)) capabilities.add('tools');

  return {
    identifier,
    display_name: m.display_name ?? m.name ?? identifier,
    description: typeof m.description === 'string' ? m.description.slice(0, 400) : '',
    context_window: contextWindow,
    max_output: maxOutput,
    input_price: perToken(m.pricing?.prompt ?? m.pricing?.input),
    output_price: perToken(m.pricing?.completion ?? m.pricing?.output),
    capabilities: [...capabilities],
    owned_by: m.owned_by ?? m.organization ?? null,
    created: m.created ?? null,
  };
}

function firstNumber(values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

/**
 * Resolve inference endpoints consistently for OpenAI-compatible servers.
 * A common panel mistake is entering a host such as https://api.example.com
 * while the provider requires /v1/chat/completions. Preserve explicit /v1
 * base URLs, but add the version segment when the endpoint is OpenAI-shaped.
 */
export function openAiUrl(baseUrl, path) {
  const base = String(baseUrl ?? '').replace(/\/+$/, '');
  let endpoint = `/${String(path ?? '').replace(/^\/+/, '')}`;
  const basePath = (() => {
    try { return new URL(base).pathname; } catch { return base; }
  })();
  const hasVersion = /\/v\d+(?:\/|$)/.test(basePath);
  if (hasVersion) endpoint = endpoint.replace(/^\/v\d+(?=\/|$)/, '');
  const isInferencePath = /^(?:\/chat\/completions|\/embeddings|\/audio\/|\/models)/.test(endpoint);
  return `${base}${isInferencePath && !hasVersion ? '/v1' : ''}${endpoint}`;
}
