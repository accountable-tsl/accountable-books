import type { PatternSignals } from './enrichment.types.js';
import {
  generateChecksumSync,
  generateFingerprintSync,
} from '../../shared/index.js';

const HTML_TAG_RE = /<[^>]*>/g;
const CONTROL_ZW_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g;
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
/**
 * Normalize transaction description for consistent processing
 * - Trims whitespace
 * - Strips HTML tags
 * - Collapses multiple spaces
 */
// export function normalizeDescription(description: string): string {
//   return description
//     .trim()
//     .replace(/<[^>]*>/g, '') // Remove HTML tags
//     .replace(/\s+/g, ' ') // Collapse multiple spaces
//     .trim();
// }
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

/**
 * Tokenize description into searchable tokens
 * Removes stop words and special characters
 */
// export function tokenizeDescription(description: string): string[] {
//   const stopWords = new Set([
//     'THE',
//     'AND',
//     'OR',
//     'FOR',
//     'TO',
//     'FROM',
//     'AT',
//     'IN',
//     'ON',
//     'WITH',
//     'BY',
//   ]);

//   return description
//     .toUpperCase()
//     .split(/[^A-Z0-9]+/)
//     .filter((token) => token.length > 2 && !stopWords.has(token));
// }
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

/**
 * Extract contact name from transaction description using common patterns
 * Examples:
 * - "UBER *TRIP 12345" -> "UBER"
 * - "SQ *COFFEE SHOP" -> "SQUARE"
 * - "PAYPAL *AMAZON" -> "PAYPAL"
 */
export function extractContactFromDescription(
  description: string,
): string | null {
  if (!description) return null;

  const normalized = description.toUpperCase().trim();

  // Pattern 1: "<NAME> *<DESCRIPTOR>" (e.g., "UBER *TRIP")
  const asteriskPattern = /^([A-Z0-9\s]+?)\s*\*/;
  const asteriskMatch = normalized.match(asteriskPattern);
  if (asteriskMatch) {
    return asteriskMatch[1].trim();
  }

  // Pattern 2: "SQ *" or "TST*" (Square, Toast, etc.)
  const shortCodePattern = /^([A-Z]{2,4})\s*\*/;
  const shortCodeMatch = normalized.match(shortCodePattern);
  if (shortCodeMatch) {
    return shortCodeMatch[1].trim();
  }

  // Pattern 3: First word/phrase before special characters
  const firstWordPattern = /^([A-Z][A-Z0-9\s&-]{2,}?)(?:\s*[-#*/]|\s{2,}|$)/;
  const firstWordMatch = normalized.match(firstWordPattern);
  if (firstWordMatch) {
    return firstWordMatch[1].trim();
  }

  // Fallback: First 3-50 characters (reasonable merchant name length)
  const fallback = normalized
    .substring(0, 50)
    .split(/\s+/)
    .slice(0, 5)
    .join(' ');
  return fallback || null;
}

/**
 * Generate consistent SHA256 fingerprint from normalized contact name
 * Used for grouping unknown contacts before they're matched to real contacts
 */
export function generateContactFingerprint(normalizedName: string): string {
  const canonical = normalizedName.toLowerCase().trim();
  return generateFingerprintSync(canonical);
}

/**
 * Detect pattern signals from transaction description and amount
 * Returns flags for likely splits, tax, FX, prepayments, etc.
 */
export function detectPatternSignals({
  description,
  amount,
  currencyCode,
}: {
  description: string;
  amount: number;
  currencyCode: string;
}): PatternSignals {
  const descUpper = description.toUpperCase();
  const notes: string[] = [];

  // Split transaction keywords
  const splitKeywords = [
    'SPLIT',
    'PARTIAL',
    'INSTALLMENT',
    'PAYMENT 1 OF',
    'PAYMENT 2 OF',
  ];
  const likely_split = splitKeywords.some((kw) => descUpper.includes(kw));
  if (likely_split) notes.push('Split transaction detected');

  // Transfer between accounts keywords
  const transferKeywords = [
    'TRANSFER',
    'TRF',
    'INTERNAL TRANSFER',
    'MOVE MONEY',
    'WALLET TOPUP',
    'WALLET TOP-UP',
  ];
  const likely_trf_btw_accounts = transferKeywords.some((kw) =>
    descUpper.includes(kw),
  );
  if (likely_trf_btw_accounts) notes.push('Inter-account transfer detected');

  // Tax keywords
  const taxKeywords = [
    'VAT',
    'TAX',
    'WHT',
    'WITHHOLDING',
    'PAYE',
    'HMRC',
    'IRS',
    'FIRS',
  ];
  const likely_tax = taxKeywords.some((kw) => descUpper.includes(kw));
  if (likely_tax) notes.push('Tax-related transaction detected');

  // Foreign exchange keywords
  const fxKeywords = [
    'FOREIGN EXCHANGE',
    'FX',
    'CURRENCY CONVERSION',
    'EXCHANGE RATE',
  ];
  const likely_fx = fxKeywords.some((kw) => descUpper.includes(kw));
  if (likely_fx) notes.push('FX transaction detected');

  // Prepayment keywords
  const prepaymentKeywords = [
    'PREPAYMENT',
    'ADVANCE',
    'DEPOSIT',
    'RETAINER',
    'ESCROW',
  ];
  const likely_prepayment = prepaymentKeywords.some((kw) =>
    descUpper.includes(kw),
  );
  if (likely_prepayment) notes.push('Prepayment/advance detected');

  // Recurring transaction pattern (simple heuristic - will be refined with historical data)
  const recurringKeywords = [
    'SUBSCRIPTION',
    'MONTHLY',
    'ANNUAL',
    'RECURRING',
    'AUTO-RENEWAL',
  ];
  const is_recurring = recurringKeywords.some((kw) => descUpper.includes(kw));
  if (is_recurring) notes.push('Recurring transaction pattern');

  // Anomaly detection (simple thresholds - will be enhanced with ML)
  const anomaly_detected = Math.abs(amount) > 1000000; // > 1M in base currency
  if (anomaly_detected) notes.push('Unusually large amount');

  // VAT check required (for certain countries)
  const requires_vat_check =
    likely_tax && ['GBP', 'EUR', 'NGN'].includes(currencyCode);

  // FX review required
  const requires_fx_review = likely_fx || currencyCode !== 'USD';

  return {
    likely_split,
    likely_trf_btw_accounts,
    likely_tax,
    likely_fx,
    likely_prepayment,
    is_recurring,
    anomaly_detected,
    notes,
    requires_vat_check,
    requires_fx_review,
  };
}

/**
 * Compute temporal features for a transaction date
 */
export function computeTemporalFeatures({
  date,
  fiscalYearEnd,
  timezone,
}: {
  date: Date;
  fiscalYearEnd: string; // MM-DD format like "12-31"
  timezone: string;
}): {
  day_of_week: number;
  day_of_month: number;
  month: number;
  quarter: number;
  fiscal_quarter: number;
  is_month_end: boolean;
  is_year_end: boolean;
} {
  // Convert to company timezone
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number);
  const tzDate = new Date(year, month - 1, day);

  const day_of_week = tzDate.getDay(); // 0 = Sunday
  const day_of_month = tzDate.getDate();
  const monthNum = tzDate.getMonth() + 1; // 1-12

  // Calendar quarter
  const quarter = Math.ceil(monthNum / 3);

  // Check if month end
  const lastDayOfMonth = new Date(year, monthNum, 0).getDate();
  const is_month_end = day === lastDayOfMonth;

  // Check if year end (calendar)
  const is_year_end = monthNum === 12 && day === 31;

  // Fiscal quarter calculation
  const [fyEndMonth, fyEndDay] = fiscalYearEnd.split('-').map(Number);

  // Determine fiscal year start month
  const fyStartMonth = fyEndMonth === 12 ? 1 : fyEndMonth + 1;

  // Calculate months since fiscal year start
  let monthsSinceFYStart = monthNum - fyStartMonth;
  if (monthsSinceFYStart < 0) {
    monthsSinceFYStart += 12;
  }

  const fiscal_quarter = Math.ceil((monthsSinceFYStart + 1) / 3);

  return {
    day_of_week,
    day_of_month,
    month: monthNum,
    quarter,
    fiscal_quarter,
    is_month_end,
    is_year_end,
  };
}

/**
 * Calculate days until period close
 */
export function calculateDaysToPeriodClose({
  startDate,
  endDate,
}: {
  startDate: Date;
  endDate: Date;
}): number {
  const date = startDate;
  const periodEnd = endDate;
  const diffTime = periodEnd.getTime() - date.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Determine typical transaction frequency from date gaps
 */
export function determineTypicalFrequency(
  transactionDates: Date[],
): 'one_time' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'irregular' {
  if (transactionDates.length < 2) return 'one_time';

  // Sort dates
  const sorted = transactionDates.sort((a, b) => a.getTime() - b.getTime());

  // Calculate gaps in days
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diffMs = sorted[i].getTime() - sorted[i - 1].getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    gaps.push(diffDays);
  }

  // Calculate average gap
  const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

  // Calculate standard deviation
  const variance =
    gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);

  // If high variance, it's irregular
  if (stdDev > avgGap * 0.5) return 'irregular';

  // Classify by average gap
  if (avgGap <= 10) return 'weekly'; // ~7 days ± 3
  if (avgGap <= 35) return 'monthly'; // ~30 days ± 5
  if (avgGap <= 100) return 'quarterly'; // ~90 days ± 10
  if (avgGap <= 380) return 'annual'; // ~365 days ± 15

  return 'irregular';
}

/**
 * Generate checksum for enriched transaction (SHA256)
 */
export function generateEnrichmentChecksum(data: unknown): string {
  return generateChecksumSync(data, { sortKeys: false });
}

export function generateStatsSnapshotChecksum(data: unknown): string {
  return generateChecksumSync(data, { sortKeys: false });
}

/**
 * Create company settings checksum from key company properties
 */
export function generateCompanySettingsChecksum(settings: {
  accountingBasis: string;
  reportingFramework: string;
  reportingCurrencyId: string;
  fiscalYearEnd: string;
  coaVersion: string;
}): string {
  return generateChecksumSync(settings, { length: 16 });
}
