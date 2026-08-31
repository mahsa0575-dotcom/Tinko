import { AIError, classifyHttpError, wrapNetworkError } from './errors.js';

/**
 * Base class for all AI provider adapters.
 *
 * A provider adapter owns: authentication, request building, response parsing,
 * streaming, error normalization, retry policy and health checks.
 * Adding a new provider NEVER requires changing the bot or the router.
 */
export class AIProviderAdapter {
  /**
   * @param {object} providerRow row from `providers` table
   * @param {object} deps { fetch (injectable for tests), logger }
   */
  constructor(providerRow, deps = {}) {
    this.provider = providerRow;
    this.id = providerRow.id;
    this.slug = providerRow.slug;
    this.kind = providerRow.kind;
    this.baseUrl = providerRow.base_url;
    this.config = typeof providerRow.config === 'string' ? JSON.parse(providerRow.config || '{}') : providerRow.config || {};
    this.timeoutMs = providerRow.timeout_ms ?? 60_000;
    this.maxRetries = providerRow.max_retries ?? 2;
    this.fetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
    this.log = deps.logger?.child?.({ provider: this.slug }) ?? { debug() {}, info() {}, warn() {}, error() {} };
  }

  /** Adapter capabilities; override where relevant. */
  get capabilities() {
    return new Set(['chat']);
  }

  supports(cap) {
    return this.capabilities.has(cap);
  }

  /**
   * Core chat completion. Subclasses must implement.
   * @param {object} req { model, messages:[{role,content}], temperature, maxTokens, tools? }
   * @param {object} ctx { apiKey, signal? }
   * @returns {Promise<{content:string, usage:{inputTokens,outputTokens}, finishReason:string, raw:object}>}
   */
  async chat(req, ctx) {
    throw new AIError('bad_response', `Adapter ${this.kind} does not implement chat()`, { retryable: false });
  }

  /** Health probe: cheap authenticated request. Returns {ok, latencyMs, error}. */
  async healthCheck(ctx) {
    const start = Date.now();
    try {
      await this.chat({ model: ctx.model ?? 'health', messages: [{ role: 'user', content: 'ping' }], maxTokens: 1 }, ctx);
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message };
    }
  }

  /**
   * POST JSON with timeout + normalized errors + exponential-backoff retry
   * for transient failures only.
   */
  async requestJson({ url, headers, body, signal }) {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let res;
      try {
        res = await this.fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify(body),
          signal: merged,
        });
      } catch (err) {
        throw wrapNetworkError(err);
      }
      if (res.ok) {
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          throw new AIError('bad_response', 'Provider returned invalid JSON', { retryable: false });
        }
      }
      const bodyText = await res.text().catch(() => '');
      const error = classifyHttpError(res.status, bodyText);
      const retryable = error.retryable && attempt <= this.maxRetries && !signal?.aborted;
      this.log.warn('provider request failed', { status: res.status, kind: error.kind, attempt, retryable });
      if (!retryable) throw error;
      // Exponential backoff with jitter: 400ms, 800ms, ...
      await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1) + Math.random() * 200));
    }
  }
}
