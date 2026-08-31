import { OpenAICompatibleAdapter } from './openai-compatible.js';
import { AnthropicAdapter } from './anthropic.js';
import { CustomHttpAdapter } from './custom-http.js';
import { MockAdapter } from './mock.js';
import { AIError } from './errors.js';

const ADAPTER_KINDS = {
  openai_compatible: OpenAICompatibleAdapter,
  anthropic: AnthropicAdapter,
  custom_http: CustomHttpAdapter,
  mock: MockAdapter,
};

export function createAdapter(providerRow, deps) {
  const Ctor = ADAPTER_KINDS[providerRow.kind];
  if (!Ctor) throw new AIError('bad_response', `Unknown provider kind: ${providerRow.kind}`, { retryable: false });
  return new Ctor(providerRow, deps);
}
