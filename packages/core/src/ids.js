import crypto from 'node:crypto';

/** URL-safe random ID with a short prefix, e.g. "req_b1c2...". */
export function newId(prefix) {
  const id = crypto.randomUUID().replaceAll('-', '');
  return prefix ? `${prefix}_${id}` : id;
}

export const newRequestId = () => newId('req');
export const newTraceId = () => newId('trc');
export const newAiRequestId = () => newId('air');
export const newJobId = () => newId('job');
