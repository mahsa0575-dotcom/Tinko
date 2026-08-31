/**
 * Persian text normalization + profanity detection engine.
 *
 * Handles: Arabic/Persian character unification, diacritics, zero-width
 * characters, repeated characters, spaced-out letters ("ف ح ش"), common
 * leetspeak digits, and multi-layer matching (exact → condensed → regex).
 *
 * The wordlist is extensible: rules stored in `moderation_rules` (kind=wordlist)
 * are merged with the built-in seeds. Admins manage their own lists via API.
 */

// Arabic → Persian unification
const CHAR_MAP = new Map(Object.entries({
  'ي': 'ی', 'ى': 'ی', 'ى': 'ی', 'ك': 'ک', 'ؤ': 'و', 'إ': 'ا', 'أ': 'ا', 'آ': 'ا', 'ة': 'ه',
  '\u200c': '', // ZWNJ
  '\u200f': '', '\u200e': '', '\u064b': '', '\u064c': '', '\u064d': '',
  '\u064e': '', '\u064f': '', '\u0650': '', '\u0651': '', '\u0652': '',
  // common chat leetspeak (shape-based)
  '٧': 'ت', '7': 'ت', '٥': 'ه', '5': 'ه', '٣': 'ع', '3': 'ع', '٤': 'ی', '6': 'ط',
  '0': 'و', '9': 'ق', '8': 'ب', '1': 'ی',
}));

export function normalizePersian(text) {
  let out = String(text ?? '');
  out = out.replace(/[\u064B-\u0652\u200c\u200e\u200f]/g, ''); // diacritics + marks
  out = [...out].map((ch) => CHAR_MAP.get(ch) ?? ch).join('');
  out = out.toLowerCase();
  return out;
}

/** Remove spaces entirely — used to catch "ف ح ش" style obfuscation. */
export const condense = (s) => s.replace(/\s+/g, '');

/** Collapse runs of 3+ repeated chars to one: "فحشششش" → "فحش". */
export const collapseRepeats = (s) => s.replace(/(.)\1{2,}/g, '$1');

// Conservative seed roots; extend via moderation_rules (kind=wordlist).
const SEED_ROOTS = [
  'کیر', 'کون', 'جند', 'خارکساره', 'حرومزاده', 'فحش',
];

export function createProfanityEngine(extraWords = []) {
  const roots = [...new Set([...SEED_ROOTS, ...extraWords.map(normalizePersian)])];
  return {
    /**
     * @returns {{flagged:boolean, matched?:string, layer?:string}}
     */
    check(text) {
      const normalized = normalizePersian(text);
      if (!normalized) return { flagged: false };
      const condensed = condense(normalized);
      const collapsed = collapseRepeats(condensed);
      for (const root of roots) {
        if (normalized.includes(root)) return { flagged: true, matched: root, layer: 'exact' };
        if (collapsed.includes(root)) return { flagged: true, matched: root, layer: 'collapsed' };
      }
      return { flagged: false };
    },
  };
}

/**
 * Detect whether the bot's (custom, Persian) name was called in the text,
 * e.g. "هوشیا خوبی؟". Works on normalized tokens; tolerates up to a 2-char
 * suffix so casual conjugations match, but never a substring in the middle
 * of an unrelated word.
 */
export function textMentionsName(text, name) {
  if (!text || !name) return false;
  const target = normalizePersian(name).trim();
  if (target.length < 2) return false;
  const tokens = normalizePersian(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return tokens.some((t) =>
    t === target ||
    (target.length >= 3 && t.startsWith(target) && t.length - target.length <= 2));
}
