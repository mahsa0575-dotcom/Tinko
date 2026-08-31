import { AIProviderAdapter } from './adapter.js';
import { AIError } from './errors.js';

/**
 * Mock provider for tests, CI and the admin sandbox.
 * Behavior is driven by config.mode: success|timeout|rate_limit|server_error|
 * invalid_credentials|malformed|stream_failure.
 * Produces deterministic Persian responses; never calls the network.
 */
export class MockAdapter extends AIProviderAdapter {
  get capabilities() {
    return new Set(['chat', 'streaming', 'vision', 'embeddings', 'tools']);
  }

  async chat(req, ctx) {
    const mode = this.config.mode ?? 'success';
    const delay = this.config.delayMs ?? 10;
    await new Promise((r) => setTimeout(r, delay));
    switch (mode) {
      case 'timeout': throw new AIError('timeout', 'mock timeout');
      case 'rate_limit': throw new AIError('rate_limit', 'mock rate limit');
      case 'server_error': throw new AIError('server_error', 'mock server error');
      case 'invalid_credentials': throw new AIError('auth', 'mock auth failure');
      case 'malformed': throw new AIError('bad_response', 'mock malformed response', { retryable: false });
      default: {
        const last = [...req.messages].reverse().find((m) => m.role === 'user');
        const echo = this.config.echo ?? last?.content ?? '';
        return {
          content: this.config.response ?? `[mock:${req.model}] ${echo}`,
          usage: { inputTokens: Math.ceil(JSON.stringify(req.messages).length / 4), outputTokens: 8 },
          finishReason: 'stop',
          raw: { mock: true },
        };
      }
    }
  }

  /** Deterministic catalogue so the panel's discovery flow is testable offline. */
  async listRemoteModels() {
    if ((this.config.mode ?? 'success') !== 'success') {
      throw new AIError('server_error', `mock mode=${this.config.mode}`);
    }
    return {
      supported: true,
      models: this.config.remoteModels ?? [
        { identifier: 'mock-smart', display_name: 'Mock Smart', description: '', context_window: 128_000, max_output: 4096, input_price: null, output_price: null, capabilities: ['chat', 'streaming', 'tools'], owned_by: 'mock', created: null },
        { identifier: 'mock-fast', display_name: 'Mock Fast', description: '', context_window: 32_000, max_output: 2048, input_price: null, output_price: null, capabilities: ['chat', 'streaming'], owned_by: 'mock', created: null },
      ],
    };
  }

  async healthCheck(ctx) {
    const ok = (this.config.mode ?? 'success') === 'success';
    return { ok, latencyMs: 1, error: ok ? undefined : `mock mode=${this.config.mode}` };
  }
}
