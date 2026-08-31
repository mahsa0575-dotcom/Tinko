import { describe, it, expect, vi } from 'vitest';
import { createAiRouter } from '../src/router.js';
import { CircuitBreaker } from '../src/circuit-breaker.js';
import { createAdapter } from '../src/factory.js';
import { AIError } from '../src/errors.js';

function makeProviderRow(overrides = {}) {
  return {
    id: 1, slug: 'mock', kind: 'mock', base_url: null,
    config: {}, timeout_ms: 1000, max_retries: 0,
    health: 'healthy', status: 'active',
    ...overrides,
  };
}

function makeModelRow(overrides = {}) {
  return {
    id: 10, provider_id: 1, identifier: 'mock-model', priority: 100,
    capabilities: ['chat'], status: 'active', provider_slug: 'mock',
    provider_kind: 'mock', provider_health: 'healthy',
    provider_config: {}, base_url: null, timeout_ms: 1000, max_retries: 0,
    tenant_id: 1,
    ...overrides,
  };
}

function makeRepos({ models, keySecrets = ['sk-1'] } = {}) {
  const modelList = models ?? [makeModelRow()];
  return {
    aiConfig: {
      allActiveModels: async () => modelList,
      listProfiles: async (tenantId) => [
        { key: 'balanced', name: 'Balanced', models: modelList.map((m, i) => ({ model_id: m.id, position: i })) },
      ],
      getActiveKeySecret: async () => ({ id: 1, secret: keySecrets[0] }),
    },
    ops: { recordUsage: vi.fn(async () => {}) },
  };
}

describe('AI router', () => {
  it('routes through the primary model and records usage', async () => {
    const repos = makeRepos();
    const router = createAiRouter({ aiConfigRepo: repos.aiConfig, opsRepo: repos.ops, logger: quiet() });
    const result = await router.chat(
      { messages: [{ role: 'user', content: 'سلام' }] },
      { tenantId: 1, profileKey: 'balanced' });
    expect(result.content).toContain('[mock:mock-model]');
    expect(result.routed.fallbackUsed).toBe(false);
    expect(repos.ops.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', tenantId: 1 }));
  });

  it('falls back to the next candidate when the primary fails', async () => {
    const failing = makeModelRow({ id: 10, provider_id: 1 });
    const working = makeModelRow({ id: 20, provider_id: 2, provider_kind: 'mock' });
    // Provider 2 uses a separate adapter instance; give it success config via factory defaults.
    const repos = makeRepos({ models: [failing, working], keySecrets: ['sk-1', 'sk-2'] });
    repos.aiConfig.getActiveKeySecret = async (providerId) => ({ id: providerId, secret: `sk-${providerId}` });
    const router = createAiRouter({ aiConfigRepo: repos.aiConfig, opsRepo: repos.ops, logger: quiet() });

    // Force provider 1 to fail by breaking its circuit directly.
    router.breaker.recordFailure('1', new AIError('auth', 'bad key'));
    // Half-open allows one attempt; make all provider-1 attempts fail via mock config? Simpler:
    // open the circuit fully so it is skipped and fallback is exercised.
    for (let i = 0; i < 6; i++) router.breaker.recordFailure('1', new AIError('server_error', 'down'));

    const result = await router.chat(
      { messages: [{ role: 'user', content: 'salam' }] },
      { tenantId: 1 });
    expect(result.routed.providerId).toBe(2);
    expect(result.routed.fallbackUsed).toBe(true);
  });

  it('throws a Persian capacity error when no candidate works', async () => {
    const failing = makeModelRow({ id: 10, provider_id: 1 });
    const repos = makeRepos({ models: [failing] });
    const router = createAiRouter({ aiConfigRepo: repos.aiConfig, opsRepo: repos.ops, logger: quiet() });
    // Open the circuit so the only provider is skipped.
    for (let i = 0; i < 6; i++) router.breaker.recordFailure('1', new AIError('server_error', 'down'));
    await expect(router.chat({ messages: [] }, { tenantId: 1 }))
      .rejects.toThrow(/هیچ مدل در دسترسی/);
  });

  it('accepts a plain messages array as the first argument (regression)', async () => {
    // Several callers (memory extraction, ai-moderation, tool loop, test-chat)
    // pass an array, not a { messages } object. The router must normalize it.
    const repos = makeRepos();
    const router = createAiRouter({ aiConfigRepo: repos.aiConfig, opsRepo: repos.ops, logger: quiet() });
    const result = await router.chat(
      [{ role: 'user', content: 'سلام' }],
      { tenantId: 1, profileKey: 'balanced' });
    expect(result.content).toContain('[mock:mock-model]');
    expect(result.content).toContain('سلام');
  });

  it('testProvider builds an adapter from a provider row (regression)', async () => {
    // testProvider receives a real `providers` row (kind/slug/config directly),
    // NOT a model row. It must not route through getAdapter() (which expects
    // provider_id/provider_kind) or every admin "Test connection" 500s.
    const repos = makeRepos();
    const router = createAiRouter({ aiConfigRepo: repos.aiConfig, opsRepo: repos.ops, logger: quiet() });
    const result = await router.testProvider(makeProviderRow({ kind: 'mock' }), 'sk-1');
    expect(result.ok).toBe(true);
  });

  it('filters by required capabilities (vision routing)', async () => {
    const textModel = makeModelRow({ id: 10, capabilities: ['chat'] });
    const visionModel = makeModelRow({ id: 20, capabilities: ['chat', 'vision'] });
    const repos = makeRepos({ models: [textModel, visionModel] });
    const router = createAiRouter({ aiConfigRepo: repos.aiConfig, opsRepo: repos.ops, logger: quiet() });
    const list = await router.candidates({ tenantId: 1, require: ['vision'] });
    expect(list.map((m) => m.id)).toEqual([20]);
  });

  it('fails fast when no API key is configured', async () => {
    const repos = makeRepos();
    repos.aiConfig.getActiveKeySecret = async () => null;
    const router = createAiRouter({ aiConfigRepo: repos.aiConfig, opsRepo: repos.ops, logger: quiet() });
    await expect(router.chat({ messages: [] }, { tenantId: 1 }))
      .rejects.toThrow(/هیچ مدل در دسترسی/);
  });
});

describe('circuit breaker', () => {
  it('opens after the failure threshold and half-opens later', () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 5; i++) breaker.recordFailure('p1', new Error('x'));
    expect(breaker.canPass('p1')).toBe(false);
    expect(breaker.getState('p1').state).toBe('open');

    // simulate elapsed open duration
    breaker.circuits.get('p1').openedAt = Date.now() - 60_000;
    expect(breaker.canPass('p1')).toBe(true);
    expect(breaker.getState('p1').state).toBe('half_open');
    breaker.recordSuccess('p1');
    expect(breaker.getState('p1').state).toBe('closed');
  });
});

describe('adapter factory', () => {
  it('creates the right adapter per kind', () => {
    expect(createAdapter(makeProviderRow({ kind: 'mock' }), {})).toBeTruthy();
    expect(() => createAdapter(makeProviderRow({ kind: 'unknown' }), {})).toThrow(/Unknown provider kind/);
  });
});

function quiet() {
  return { debug() {}, info() {}, warn() {}, error() {}, child: () => quiet() };
}
