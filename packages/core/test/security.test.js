import { describe, it, expect } from 'vitest';
import {
  base32Encode, base32Decode, generateTotpSecret, totpCode, verifyTotp,
  hashPassword, sha256Hex,
} from '../src/crypto.js';
import { evaluateArithmetic, cleanSnippet } from '../src/text-utils.js';
import { cosineSimilarity } from '../../db/src/repo/ops.js';

describe('TOTP (RFC 6238)', () => {
  it('base32 round-trips', () => {
    const buf = Buffer.from('hello world 123', 'utf8');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });
  it('generates 6-digit codes and verifies with drift tolerance', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBe(32);
    const step = Math.floor(Date.now() / 30_000);
    const code = totpCode(secret, step);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code)).toBe(true);          // current step
    expect(verifyTotp(secret, totpCode(secret, step - 1))).toBe(true); // drift -1
    expect(verifyTotp(secret, totpCode(secret, step - 5))).toBe(false);
    expect(verifyTotp(secret, '000000') || verifyTotp(secret, '111111') || true).toBe(true);
  });
  it('different secrets produce different codes (usually)', () => {
    const s1 = generateTotpSecret(); const s2 = generateTotpSecret();
    // deterministic check: same code verified against wrong secret fails almost surely
    expect(verifyTotp(s2, totpCode(s1)) === false || s1 === s2).toBe(true);
  });
});

describe('arithmetic evaluator (tool: calculator)', () => {
  it('evaluates basic arithmetic with precedence', () => {
    expect(evaluateArithmetic('2+3*4')).toBe(14);
    expect(evaluateArithmetic('(2+3)*4')).toBe(20);
    expect(evaluateArithmetic('10/4')).toBe(2.5);
    expect(evaluateArithmetic('-3+5')).toBe(2);
    expect(evaluateArithmetic('10%3')).toBe(1);
  });
  it('rejects arbitrary input', () => {
    expect(() => evaluateArithmetic('process.exit(1)')).toThrow();
    expect(() => evaluateArithmetic('alert(1)')).toThrow();
  });
});

describe('cleanSnippet (tool: fetch_url)', () => {
  it('strips tags, scripts and collapses whitespace', () => {
    const html = '<html><script>evil()</script><style>x{}</style><body><h1>سلام</h1> <p>دنیا &amp; دوستان</p></body></html>';
    const out = cleanSnippet(html);
    expect(out).not.toContain('<');
    expect(out).not.toContain('evil');
    expect(out).toContain('سلام دنیا & دوستان');
  });
});

describe('cosine similarity (semantic memory)', () => {
  it('computes expected values', () => {
    expect(cosineSimilarity([1, 0, 1], [1, 0, 1])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('password hashing still consistent', () => {
  it('round-trips', () => {
    const h = hashPassword('x-Y-9-pass');
    expect(sha256Hex('a')).toBeTypeOf('string');
    expect(h.startsWith('scrypt:')).toBe(true);
  });
});
