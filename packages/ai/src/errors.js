/**
 * Normalized AI provider errors.
 * Every adapter maps provider-specific failures into these kinds so that
 * the router, circuit breaker and retry policy can act uniformly.
 */
export class AIError extends Error {
  /**
   * @param {string} kind auth|rate_limit|timeout|server_error|bad_response|network|capacity|aborted
   * @param {string} message human-readable, secret-free
   * @param {object} [meta] httpStatus, provider, model, retryable
   */
  constructor(kind, message, meta = {}) {
    super(message);
    this.name = 'AIError';
    this.kind = kind;
    this.retryable = meta.retryable ?? ['timeout', 'network', 'capacity', 'server_error', 'rate_limit'].includes(kind);
    Object.assign(this, meta);
  }
}

/** Classify an HTTP status from any provider. */
export function classifyHttpError(status, bodyText) {
  const snippet = (bodyText || '').slice(0, 300);
  if (status === 401 || status === 403) return new AIError('auth', `Authentication failed (HTTP ${status}): ${snippet}`, { httpStatus: status });
  if (status === 429) return new AIError('rate_limit', `Rate limited (HTTP 429): ${snippet}`, { httpStatus: status });
  if (status === 408) return new AIError('timeout', `Provider timeout (HTTP 408)`, { httpStatus: status });
  if (status >= 500) return new AIError('server_error', `Provider server error (HTTP ${status}): ${snippet}`, { httpStatus: status });
  if (status === 400) return new AIError('bad_response', `Bad request (HTTP 400): ${snippet}`, { httpStatus: status, retryable: false });
  return new AIError('bad_response', `Unexpected HTTP ${status}: ${snippet}`, { httpStatus: status });
}

export function wrapNetworkError(err) {
  if (err.name === 'AbortError') return new AIError('timeout', 'Request timed out', { cause: err.code });
  return new AIError('network', `Network error: ${err.message}`, { cause: err.code });
}
