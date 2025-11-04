// Input: a *normalized* description string (use your normalizeDescription first).
// Output: a single best-guess contact string, or null if nothing sensible found.

const MULTI_SPACE_RE = /\s+/g;

// Minimal boilerplate words we don't want as trailing fluff on names
const TRAILING_TRIM =
  /\b(?:TRANSACTION|TRANSFER|PAYMENT|PMT|POS|DEBIT|CREDIT|ONLINE|WEB\s*ID)\b\.?$/i;

// Very small set of extractors (broad but simple, ordered). First good hit usually wins.
const EXTRACTORS: RegExp[] = [
  /\bFROM\s+([A-Z0-9 .,'&/()-]{3,80})/i, // "... FROM <X> ..."
  /\bFRM\s+([A-Z0-9 .,'&/()-]{3,80})/i, // "... FRM <X> ..."
  /\bTO\s+([A-Z0-9 .,'&/()-]{3,80})/i, // "... TO <Y> ..."
  /\bIFO[: ]\s*([A-Z0-9 .,'&/()-]{3,80})/i, // "... IFO <Y> ..."
  /\bTRANSFER\s+TO\s+([A-Z0-9 .,'&/()-]{3,80})/i, // "TRANSFER TO <Y>"
  /\bTRANSFER\s+IFO[: ]\s*([A-Z0-9 .,'&/()-]{3,80})/i, // "TRANSFER IFO <Y>"
  /\bDEBIT\s+CARD\s+PURCHASE\s+([A-Z0-9 .,'&/()-]{3,80})/i, // "DEBIT CARD PURCHASE <M>"
  /\bPOS\s+[0-9X* -]{6,}\s+([A-Z0-9 .,'&//-]{3,80})\s+POS\b/i, // "POS <mask> <M> POS ..."
  /\bMERCHANT[: -]\s*([A-Z0-9 .,'&/()-]{3,80})/i, // "MERCHANT: <M>"
  /\bCO\s*NAME[: -]\s*([A-Z0-9 .,'&/()-]{3,80})/i, // "CO NAME: <M>" (ACH)
  /UPI-[^-]*-([A-Z0-9._]+)@/i, // "UPI-...-name.handle@..." → capture name.handle
];

// Quick cleanup of a captured candidate.
function cleanCandidate(s: string): string {
  let out = s
    .replace(/[<>]/g, ' ') // drop angle artifacts if any leaked
    .replace(/[:|]/g, ' ')
    .replace(MULTI_SPACE_RE, ' ')
    .trim();

  // If we captured a UPI-style "shamim.mokles", make it human-ish: "SHAMIM MOKLES"
  if (/^[A-Z0-9._-]+$/i.test(out) && out.includes('.')) {
    out = out.replace(/\./g, ' ');
  }

  // Trim obvious trailing fluff words
  out = out.replace(TRAILING_TRIM, '').replace(MULTI_SPACE_RE, ' ').trim();

  // Trim leading bank/channel fragments like "ZBN/" or "FBN/"
  out = out.replace(/^(?:[A-Z]{2,4}\/)+/, '').trim();

  // Clip overly long junk
  if (out.length > 80) out = out.slice(0, 80).trim();

  // If it’s basically empty or just punctuation, reject later.
  return out;
}

// Very small scoring: prefer alphabetic content and reasonable length; penalize all-numeric.
function scoreCandidate(s: string): number {
  if (!s) return -1e9;
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  const digits = (s.match(/\d/g) || []).length;
  if (letters === 0) return -100; // likely an ID, not a contact
  let score = letters * 2 - digits; // more letters than digits is good
  if (s.length >= 3 && s.length <= 60) score += 5;
  // light penalty if contains generic words at end (already trimmed but just in case)
  if (/\b(TRANSACTION|PAYMENT|TRANSFER)\b$/i.test(s)) score -= 3;
  return score;
}

/**
 * Extract a single best-guess contact (person or business) from a normalized description.
 * Returns null when nothing reasonable is found.
 */
export function extractContactFromDescription(normalized: string): string | null {
  if (!normalized) return null;

  const candidates: string[] = [];

  for (const re of EXTRACTORS) {
    const m = normalized.match(re);
    if (!m) continue;
    let captured = m[1] ?? '';
    captured = cleanCandidate(captured);

    // If the capture still contains obvious separators (often banks jam extra info),
    // pick the longest reasonable token chunk.
    if (/[/-]{2,}/.test(captured)) {
      const parts = captured.split(/[\/|-]+/).map((p) => cleanCandidate(p));
      const bestPart =
        parts.sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0] || '';
      if (bestPart) candidates.push(bestPart);
    } else {
      if (captured) candidates.push(captured);
    }
  }

  if (candidates.length === 0) return null;

  // Final pick: highest score wins; ties → longer string
  candidates.sort((a, b) => {
    const sa = scoreCandidate(a),
      sb = scoreCandidate(b);
    if (sb !== sa) return sb - sa;
    return b.length - a.length;
  });

  const best = candidates[0];
  return best && /[A-Za-z]/.test(best) ? best : null;
}
