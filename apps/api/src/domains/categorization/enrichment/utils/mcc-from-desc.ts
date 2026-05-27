import type { MccReference } from '../enrichment.types.js';

const CARD_KEYWORD_RE =
  /\b(?:MCC|VISA|MASTERCARD|MASTER\s+CARD|POS|PURCH(?:ASE)?|DEBIT|CREDIT|MERCHANT|CARD|TRANS(?:ACTION)?|ONLINE|VIRTUAL|ATM)\b/iu;

const MCC_EXPLICIT_RES: RegExp[] = [
  /\bMCC[-:=/#\s]*?(\d{4})\b/iu,
  // /\bMCC[:=\-\/#\s]*?(\d{4})\b/iu,
  /\b(\d{4})\s*MCC\b/iu,
  /\b(\d{4})MCC\b/iu,
];

const BARE_MCC_RE = /\b(\d{4})\b/giu;

export function extractMccFromDescription(
  description: string,
  mccByCode: Map<string, MccReference>,
): { code: string; obj: MccReference } | null {
  if (!description || mccByCode.size === 0) {
    return null;
  }

  const text = description.toUpperCase();

  // Explicit MCC patterns (e.g., "MCC: 1234")
  for (const re of MCC_EXPLICIT_RES) {
    const m = re.exec(text);
    if (m?.[1] && mccByCode.has(m[1])) {
      const info = mccByCode.get(m[1])!; // safe due to has()
      return { code: m[1], obj: info };
    }
  }

  // Check if text is even a card line
  if (!CARD_KEYWORD_RE.test(text)) {
    return null;
  }

  // Find all isolated 4-digit MCCs in text using BARE_MCC_RE
  const candidates: Array<{ code: string; index: number }> = [];
  BARE_MCC_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BARE_MCC_RE.exec(text))) {
    const code = match[1];
    if (mccByCode.has(code)) candidates.push({ code, index: match.index! });
  }
  if (candidates.length === 0) return null;

  // Select best MCC candidate by closest card keyword.
  let best = candidates[0];
  const kwPositions: number[] = [];
  const kwRe = new RegExp(CARD_KEYWORD_RE.source, 'giu');
  let k: RegExpExecArray | null;
  while ((k = kwRe.exec(text))) kwPositions.push(k.index!);

  if (kwPositions.length && candidates.length > 1) {
    let bestDist = Infinity;
    for (const c of candidates) {
      const dist = kwPositions.reduce(
        (d, p) => Math.min(d, Math.abs(p - c.index)),
        Infinity,
      );
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
  }

  return { code: best.code, obj: mccByCode.get(best.code)! };
}
