/** Shared small text helpers (used by AI extraction + tools). */

/** Strip HTML tags, collapse whitespace, cap length. */
export function cleanSnippet(html, maxLen = 1500) {
  const text = String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxLen);
}

/** Restricted arithmetic evaluator — no Function/eval, numbers+operators only. */
export function evaluateArithmetic(input) {
  const tokens = String(input).match(/(\d+\.?\d*|[+\-*/()%])/g);
  if (!tokens) throw new Error('empty expression');
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr() {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      v = op === '+' ? v + parseTerm() : v - parseTerm();
    }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const r = parseFactor();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  function parseFactor() {
    if (peek() === '(') { next(); const v = parseExpr(); if (peek() === ')') next(); return v; }
    if (peek() === '-') { next(); return -parseFactor(); }
    const tok = next();
    const n = Number(tok);
    if (!Number.isFinite(n)) throw new Error(`invalid token: ${tok}`);
    return n;
  }
  const result = parseExpr();
  if (pos < tokens.length) throw new Error(`unexpected token: ${tokens[pos]}`);
  return result;
}
