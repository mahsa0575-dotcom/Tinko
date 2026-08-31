import { describe, it, expect } from 'vitest';
import { renderTemplate, extractPath, extractResponse } from '../src/custom-http.js';
import { normalizePersian, createProfanityEngine } from '../../../apps/bot/src/moderation/persian.js';
import { splitForTelegram, escapeHtml, createPipeline } from '../../../apps/bot/src/pipeline.js';

describe('custom provider template engine', () => {
  it('substitutes scalar variables with JSON escaping', () => {
    const out = renderTemplate('{"model":"{{model}}","say":"{{user_id}}"}', { model: 'gpt-x', user_id: 'a"b' });
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out).say).toBe('a"b');
  });
  it('substitutes messages as JSON array', () => {
    const out = renderTemplate('{"m":{{messages}}}', { messages: [{ role: 'user', content: 'salam' }] });
    expect(JSON.parse(out).m).toHaveLength(1);
  });
  it('rejects disallowed variables', () => {
    expect(() => renderTemplate('{{evil}}', { evil: 'x' })).toThrow(/not allowed/);
  });
  it('extracts nested response paths', () => {
    const json = { data: { message: { content: 'سلام' } } };
    expect(extractResponse(json, 'data.message.content')).toBe('سلام');
  });
  it('falls back to OpenAI shape and throws when nothing found', () => {
    expect(extractResponse({ choices: [{ message: { content: 'hi' } }] }, 'x.y')).toBe('hi');
    expect(() => extractResponse({}, 'nope.path')).toThrow(/not found/);
  });
  it('extractPath resolves dotted paths', () => {
    expect(extractPath({ a: { b: [10, 20] } }, 'a.b.1')).toBe(20);
    expect(extractPath({}, 'x.y')).toBeUndefined();
  });
});

describe('persian normalization & profanity', () => {
  it('unifies Arabic characters', () => {
    expect(normalizePersian('كتاب')).toBe('کتاب');
    expect(normalizePersian('ي')).toBe('ی');
  });
  it('removes diacritics and zero-width characters', () => {
    expect(normalizePersian('مُحَمَّ\u200cد')).toBe('محمد');
  });
  it('maps leetspeak digits', () => {
    expect(normalizePersian('ف7ش')).toContain('فتش');
  });
  it('flags exact, spaced and repeated obfuscation', () => {
    const engine = createProfanityEngine(['کیر']);
    expect(engine.check('این یک کیر است').flagged).toBe(true);
    expect(engine.check('ک  ی  ر').flagged).toBe(true);
    expect(engine.check('کیررررر').flagged).toBe(true);
    expect(engine.check('سلام خوبی؟').flagged).toBe(false);
  });
  it('respects admin-provided extra words', () => {
    const engine = createProfanityEngine(['سپامیکی']);
    expect(engine.check('hello سپامیکی').flagged).toBe(true);
  });
});

describe('telegram post-processing', () => {
  it('splits long messages safely', () => {
    const long = 'x'.repeat(9000);
    const chunks = splitForTelegram(long, 4000);
    expect(chunks.length).toBe(3);
    expect(chunks.every((c) => c.length <= 4000)).toBe(true);
  });
  it('escapes html', () => {
    expect(escapeHtml('<b>&')).toBe('&lt;b&gt;&amp;');
  });
});

describe('pipeline', () => {
  it('runs stages in order and honors stop results', async () => {
    const order = [];
    const stages = [
      async function first(p) { order.push('first'); if (p.stopAtFirst) return { stop: true, reason: 'test' }; },
      async function second(p) { order.push('second'); throw new Error('boom'); },
      async function third(p) { order.push('third'); },
    ];
    const run = createPipeline(stages);
    await run({ stopAtFirst: true });
    expect(order).toEqual(['first']);

    // stage failure does not abort the pipeline: `second` records itself, throws,
    // and `third` still runs.
    order.length = 0;
    await run({});
    expect(order).toEqual(['first', 'second', 'third']);
  });
});
