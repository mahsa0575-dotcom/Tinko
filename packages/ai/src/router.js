import { createAdapter } from './factory.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { AIError } from './errors.js';
import { newAiRequestId, logger as rootLogger } from '@botai/core';

/**
 * AI Router.
 * - Resolves a logical model profile ("smart", "fast", ...) to a concrete
 *   ordered candidate list (primary + fallbacks) per tenant.
 * - Filters by required capabilities (vision, audio, tools, ...).
 * - Skips OPEN circuit breakers and disabled providers.
 * - Tries candidates in order and records usage for every attempt.
 *
 * The router never knows about Telegram; callers supply plain messages.
 */
export function createAiRouter({ aiConfigRepo, opsRepo, logger = rootLogger }) {
  const breaker = new CircuitBreaker();
  const adapters = new Map();

  function getAdapter(providerRow) {
    if (!adapters.has(providerRow.id)) {
      adapters.set(providerRow.id, createAdapter(providerRow, { logger }));
    }
    return adapters.get(providerRow.id);
  }

  /**
   * Build the ordered candidate list for a request.
   * @returns {{model, provider, adapter, reason}[]} candidates
   */
  async function candidates({ tenantId, profileKey, require = [], explicitModelId = null }) {
    const all = await aiConfigRepo.allActiveModels();
    const tenantModels = all.filter((m) => m.tenant_id === tenantId);
    const usable = tenantModels.filter((m) =>
      require.every((cap) => (m.capabilities ?? ['chat']).includes(cap)));

    let list = [];
    if (explicitModelId) {
      list = usable.filter((m) => m.id === explicitModelId);
    } else if (profileKey) {
      const profiles = await aiConfigRepo.listProfiles(tenantId);
      const profile = profiles.find((p) => p.key === profileKey)
        ?? profiles.find((p) => p.key === 'balanced');
      const byId = new Map(usable.map((m) => [m.id, m]));
      list = (profile?.models ?? [])
        .filter((pm) => pm.model_id != null)
        .sort((a, b) => a.position - b.position)
        .map((pm) => byId.get(pm.model_id))
        .filter(Boolean);
      // Append capability-matching models not in the profile as extra fallbacks.
      for (const m of usable) {
        if (!list.includes(m)) list.push(m);
      }
    } else {
      list = [...usable].sort((a, b) => a.priority - b.priority);
    }
    return list;
  }

  /**
   * Execute a chat request with routing + fallbacks.
   * @param {object} req { messages, temperature, maxTokens, tools }
   * @param {object} opts { tenantId, profileKey, require[], explicitModelId?,
   *                        groupId?, userId?, personalityId?, requestKind?, apiKeyResolver? }
   * @returns {Promise<{content, usage, finishReason, routed:{modelId, providerId, profileKey, attempts[], aiRequestId}, latencyMs}>}
   */
  async function chat(req, opts) {
    const aiRequestId = newAiRequestId();
    const attempts = [];
    // Tool calls need providers with the `tools` capability (spec §61–62).
    const requireCaps = [...(opts.require ?? [])];
    if (req.tools?.length) requireCaps.push('tools');
    const list = await candidates({
      tenantId: opts.tenantId,
      profileKey: opts.profileKey,
      require: requireCaps,
      explicitModelId: opts.explicitModelId,
    });

    if (list.length === 0) {
      throw new AIError('capacity', 'هیچ مدل فعالی برای این درخواست یافت نشد. ابتدا یک تأمین‌کننده و مدل فعال پیکربندی کنید.', { retryable: false });
    }

    let lastError;
    for (const model of list.slice(0, 5)) { // hard cap fallback depth
      const key = `${model.provider_id}`;
      const state = breaker.getState(key);
      if (!breaker.canPass(key)) {
        attempts.push({ modelId: model.id, providerId: model.provider_id, skipped: 'circuit_open', lastError: state.lastError });
        continue;
      }

      const adapter = getAdapter(model);
      const keySecret = opts.apiKeyResolver
        ? await opts.apiKeyResolver(model.provider_id)
        : await aiConfigRepo.getActiveKeySecret(model.provider_id);

      if (!keySecret?.secret) {
        attempts.push({ modelId: model.id, providerId: model.provider_id, skipped: 'no_api_key' });
        continue;
      }

      const started = Date.now();
      try {
        const result = await adapter.chat(
          { messages: req.messages, temperature: req.temperature, maxTokens: req.maxTokens, tools: req.tools },
          { apiKey: keySecret.secret, signal: opts.signal, userId: opts.userId, groupId: opts.groupId, conversationId: opts.conversationId, language: opts.language ?? 'fa' });
        const latencyMs = Date.now() - started;
        breaker.recordSuccess(key);
        attempts.push({ modelId: model.id, providerId: model.provider_id, ok: true, latencyMs });
        await opsRepo?.recordUsage({
          tenantId: opts.tenantId, groupId: opts.groupId ?? null, userId: opts.userId ?? null,
          providerId: model.provider_id, modelId: model.id, personalityId: opts.personalityId ?? null,
          requestKind: opts.requestKind ?? 'chat',
          tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens,
          latencyMs, status: 'success', aiRequestId,
        });
        return {
          ...result,
          routed: {
            aiRequestId, modelId: model.id, providerId: model.provider_id,
            profileKey: opts.profileKey ?? null, attempts, fallbackUsed: attempts.length > 1,
          },
          latencyMs,
        };
      } catch (err) {
        const latencyMs = Date.now() - started;
        breaker.recordFailure(key, err);
        attempts.push({ modelId: model.id, providerId: model.provider_id, ok: false, kind: err.kind, error: err.message, latencyMs });
        lastError = err;
        logger.warn('AI route failed, trying next candidate', {
          ai_request_id: aiRequestId, provider: model.provider_slug, model: model.identifier,
          kind: err.kind, error: err.message,
        });
      }
    }

    await opsRepo?.recordUsage({
      tenantId: opts.tenantId, groupId: opts.groupId ?? null, userId: opts.userId ?? null,
      personalityId: opts.personalityId ?? null, requestKind: opts.requestKind ?? 'chat',
      status: 'error', errorCode: lastError?.kind ?? 'no_candidate', aiRequestId,
    });
    throw lastError ?? new AIError('capacity', 'هیچ مدل در دسترسی برای این درخواست وجود ندارد.');
  }

  /**
   * Streaming chat with the same routing/fallback semantics as chat().
   * - Pre-first-delta failure: try the next candidate.
   * - Mid-stream failure: propagate; caller falls back to non-streaming.
   * Usage is estimated (chars/4) when the provider does not report it.
   * @returns {Promise<{content, usage, finishReason, routed, latencyMs}>}
   */
  async function chatStream(req, opts) {
    const aiRequestId = newAiRequestId();
    const requireCaps = [...(opts.require ?? [])];
    if (req.tools?.length) requireCaps.push('tools');
    const list = await candidates({
      tenantId: opts.tenantId, profileKey: opts.profileKey, require: requireCaps,
      explicitModelId: opts.explicitModelId,
    });
    if (list.length === 0) {
      throw new AIError('capacity', 'هیچ مدل فعالی برای این درخواست یافت نشد.', { retryable: false });
    }

    let lastError;
    for (const model of list.slice(0, 5)) {
      const key = `${model.provider_id}`;
      if (!breaker.canPass(key)) continue;
      const adapter = getAdapter(model);
      if (typeof adapter.chatStream !== 'function') continue;
      const keySecret = await aiConfigRepo.getActiveKeySecret(model.provider_id);
      if (!keySecret?.secret) continue;

      const started = Date.now();
      let content = '';
      try {
        for await (const delta of adapter.chatStream(
          { messages: req.messages, temperature: req.temperature, maxTokens: req.maxTokens },
          { apiKey: keySecret.secret, signal: opts.signal })) {
          content += delta;
          opts.onDelta?.(delta, content);
        }
        const latencyMs = Date.now() - started;
        breaker.recordSuccess(key);
        opts.onDelta?.('', content, true); // final signal
        return {
          content,
          usage: {
            inputTokens: Math.ceil(JSON.stringify(req.messages).length / 4),
            outputTokens: Math.ceil(content.length / 4),
          },
          finishReason: 'stop',
          routed: { aiRequestId, modelId: model.id, providerId: model.provider_id, streaming: true, attempts: [], fallbackUsed: false },
          latencyMs,
        };
      } catch (err) {
        breaker.recordFailure(key, err);
        lastError = err;
        if (content.length > 0) throw err; // mid-stream: caller falls back to non-stream
        logger.warn('stream route failed pre-delta', { provider: model.provider_slug, kind: err.kind, error: err.message });
      }
    }
    throw lastError ?? new AIError('capacity', 'هیچ مدل استریم‌سازی در دسترس نیست.');
  }

  /**
   * Speech-to-text via the first audio-capable provider (spec §58).
   * @returns {Promise<string|null>} transcription or null when unavailable
   */
  async function transcribe({ audioBase64, mimeType, filename, language = 'fa', tenantId = 1 }) {
    const list = await candidates({ tenantId, require: ['audio'] });
    for (const model of list.slice(0, 2)) {
      const keySecret = await aiConfigRepo.getActiveKeySecret(model.provider_id);
      if (!keySecret?.secret) continue;
      try {
        const adapter = getAdapter(model);
        const result = await adapter.transcribe({ audioBase64, mimeType, filename, language },
          { apiKey: keySecret.secret, model: model.identifier });
        return result.text || null;
      } catch (err) {
        logger.warn('transcription failed', { provider: model.provider_slug, kind: err.kind, error: err.message });
      }
    }
    return null;
  }

  /** Provider health probe (used by worker + admin test button). */
  async function testProvider(providerRow, apiKey) {
    const adapter = getAdapter(providerRow);
    return adapter.healthCheck({ apiKey, model: providerRow.config?.healthModel });
  }

  /**
   * Embed text using the first available embeddings-capable model.
   * Returns null when no embedding model is configured — callers fall back
   * to importance/recency ranking (graceful degradation, spec §30).
   */
  async function embed(input, { tenantId = 1 } = {}) {
    const list = await candidates({ tenantId, require: ['embeddings'] });
    for (const model of list.slice(0, 2)) {
      const keySecret = await aiConfigRepo.getActiveKeySecret(model.provider_id);
      if (!keySecret?.secret) continue;
      try {
        const adapter = getAdapter(model);
        const result = await adapter.embeddings({ model: model.identifier, input: Array.isArray(input) ? input : [input] },
          { apiKey: keySecret.secret });
        await opsRepo?.recordUsage({
          tenantId, providerId: model.provider_id, modelId: model.id,
          requestKind: 'embedding', tokensIn: Math.ceil(String(input).length / 4),
          status: 'success', aiRequestId: newAiRequestId(),
        });
        return result.embeddings[0] ?? null;
      } catch (err) {
        logger.warn('embedding failed', { provider: model.provider_slug, kind: err.kind, error: err.message });
      }
    }
    return null;
  }

  function breakerSnapshot() {
    return [...breaker.circuits.entries()].map(([providerId, c]) => ({
      providerId: Number(providerId), state: c.state, lastError: c.lastError,
    }));
  }

  return { chat, chatStream, transcribe, embed, candidates, testProvider, breakerSnapshot, breaker };
}
