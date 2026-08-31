/**
 * Standard application error with a machine-readable code.
 * API responses always use the shape:
 *   { error: { code, message, request_id } }
 * Stack traces and internals never reach normal clients.
 */
export class AppError extends Error {
  /**
   * @param {string} code stable machine code, e.g. GROUP_NOT_FOUND
   * @param {string} message human-readable message
   * @param {number} status HTTP status
   * @param {object} [details] optional structured details (safe to expose)
   */
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    // Fastify (and our error handler) read `statusCode`; keep both in sync or
    // every AppError silently degrades to a 500.
    this.statusCode = status;
    this.details = details;
  }
}

export const Errors = {
  unauthorized: (msg = 'Authentication required') => new AppError('UNAUTHORIZED', msg, 401),
  forbidden: (msg = 'You do not have permission to perform this action') =>
    new AppError('FORBIDDEN', msg, 403),
  notFound: (entity = 'Resource') => new AppError('NOT_FOUND', `${entity} not found`, 404),
  conflict: (msg = 'Resource already exists') => new AppError('CONFLICT', msg, 409),
  validation: (details) => new AppError('VALIDATION_ERROR', 'Request validation failed', 422, details),
  rateLimited: (msg = 'Rate limit exceeded') => new AppError('RATE_LIMITED', msg, 429),
  internal: (msg = 'Internal server error') => new AppError('INTERNAL_ERROR', msg, 500),
};
