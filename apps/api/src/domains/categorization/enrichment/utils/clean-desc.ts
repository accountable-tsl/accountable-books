const HTML_TAG_RE = /<[^>]*>/g;
const CONTROL_ZW_RE = /[\p{Control}\u200B-\u200D\u2060\uFEFF]/gu;
const MULTI_SPACE_RE = /\s+/g;

export const DEFAULT_STOPWORDS = new Set([
  'THE',
  'AND',
  'OR',
  'FOR',
  'TO',
  'FROM',
  'AT',
  'IN',
  'ON',
  'WITH',
  'BY',
  'OF',
  'A',
  'AN',
]);

export const DEFAULT_ALLOW2 = new Set([
  'US',
  'UK',
  'NG',
  'IN',
  'EU',
  'CA',
  'AU',
  'FR',
  'DE',
  'NY',
  'CA',
  'TX',
]);

export const TOKEN_RE = /\p{L}[\p{L}\p{N}_-]*/gu;

// Minimal entity decode (no deps)
function decodeEntities(s: string): string {
  return (
    s
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      // minimal numeric entities (decimal & hex), e.g. &#39; &#x2019;
      .replace(/&#([0-9]{1,7});/g, (_, n: string) => {
        const cp = Number(n);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : `&#${n};`;
      })
      .replace(/&#x([0-9A-Fa-f]{1,6});/g, (_, n: string) => {
        const cp = parseInt(n, 16);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : `&#x${n};`;
      })
  );
}

// Unify punctuation so searches match
function unifyPunct(s: string): string {
  return s
    .replace(/[\u2010-\u2015]/g, '-') // dashes → hyphen
    .replace(/[\u2018\u2019\u02BC]/g, "'") // fancy → '
    .replace(/[\u201C\u201D]/g, '"'); // fancy → "
}
export function normalizeDescription(input: string): string {
  let s = input ?? '';
  if (!s) return '';
  s = s.normalize('NFKC'); // Unicode canonicalization
  s = decodeEntities(s.replace(HTML_TAG_RE, ''));
  s = unifyPunct(s);
  s = s.replace(CONTROL_ZW_RE, ''); // strip control + zero-width
  s = s.replace(MULTI_SPACE_RE, ' ').trim();
  return s;
}

export function tokenizeDescription(
  raw: string,
  opts?: { stopwords?: Set<string>; allow2?: Set<string>; minLen?: number },
): string[] {
  const stop = opts?.stopwords ?? DEFAULT_STOPWORDS;
  const allow2 = opts?.allow2 ?? DEFAULT_ALLOW2;
  const minLen = opts?.minLen ?? 3;

  const norm = normalizeDescription(raw);
  const terms = norm.match(TOKEN_RE) ?? [];

  const out: string[] = [];
  for (const t of terms) {
    const u = t.toUpperCase();
    if (u.length === 2 && allow2.has(u)) {
      out.push(u);
      continue;
    }
    if (u.length < minLen) continue;
    if (stop.has(u)) continue;
    out.push(u);
  }
  return out;
}
