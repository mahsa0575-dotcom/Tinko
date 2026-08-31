/**
 * Circuit breaker per provider: CLOSED → OPEN → HALF_OPEN → CLOSED.
 * Prevents hammering a failing provider; OPEN circuits are skipped by the router.
 */
const FAILURE_THRESHOLD = 5;      // failures before opening
const FAILURE_WINDOW_MS = 60_000; // within this window
const OPEN_DURATION_MS = 30_000;  // time before probing again (half-open)

export class CircuitBreaker {
  constructor() {
    /** @type {Map<string, {state:string, openedAt:number, failures:number[], lastError:string}>} */
    this.circuits = new Map();
  }

  #get(key) {
    if (!this.circuits.has(key)) {
      this.circuits.set(key, { state: 'closed', openedAt: 0, failures: [], lastError: '' });
    }
    return this.circuits.get(key);
  }

  /** Whether a call may proceed right now. */
  canPass(key) {
    const c = this.#get(key);
    if (c.state === 'open') {
      if (Date.now() - c.openedAt >= OPEN_DURATION_MS) {
        c.state = 'half_open';
        return true;
      }
      return false;
    }
    return true;
  }

  getState(key) {
    const c = this.#get(key);
    if (c.state === 'closed') {
      c.failures = c.failures.filter((t) => Date.now() - t < FAILURE_WINDOW_MS);
    }
    return { state: c.state, lastError: c.lastError };
  }

  recordSuccess(key) {
    const c = this.#get(key);
    c.state = 'closed';
    c.failures = [];
  }

  recordFailure(key, error) {
    const c = this.#get(key);
    if (c.state === 'half_open') {
      c.state = 'open';
      c.openedAt = Date.now();
      c.lastError = error?.message ?? 'unknown';
      return;
    }
    c.failures.push(Date.now());
    c.failures = c.failures.filter((t) => Date.now() - t < FAILURE_WINDOW_MS);
    c.lastError = error?.message ?? 'unknown';
    if (c.failures.length >= FAILURE_THRESHOLD) {
      c.state = 'open';
      c.openedAt = Date.now();
    }
  }
}
