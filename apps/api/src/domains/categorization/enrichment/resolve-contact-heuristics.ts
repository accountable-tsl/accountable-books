import { extractContactFromDescription } from './utils/contact-from-desc.js';
import type {
  ContactMatchConfidence,
  EnrichmentContactType,
} from './enrichment.types.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

type HeuristicReason =
  | 'bank_fee'
  | 'tax'
  | 'structured'
  | 'heuristic'
  | 'self_transfer'
  | 'fallback';

export interface AliasMatcher {
  comparableAliases: string[];
  simpleAliases: string[];
  primaryDisplayName: string | null;
}

export interface HeuristicResolution {
  contactName: string;
  contactType: EnrichmentContactType;
  confidence: ContactMatchConfidence;
  fingerprintSeed?: string;
  reason: HeuristicReason;
}

export interface HeuristicArgs {
  companyId: string;
  description: string;
  aliasInfo: AliasMatcher;
  preferredContactType: EnrichmentContactType;
  countryCode?: string | null;
  transactionAmount?: number | null;
}

interface SyntheticRule {
  id: string;
  pattern: RegExp;
  display: string;
  reason: Extract<HeuristicReason, 'bank_fee' | 'tax'>;
}

interface StructuredPattern {
  id: string;
  regex: RegExp;
  direction: 'inbound' | 'outbound';
  group?: number;
}

const BASE_BANK_FEE_RULES: SyntheticRule[] = [
  {
    id: 'sms_alert',
    pattern: /^\s*SMS (ALERT|NOTIFICATION)/i,
    display: 'SMS ALERT CHARGE',
    reason: 'bank_fee',
  },
  {
    id: 'sms_alert_periodic',
    pattern: /SMS (ALERT|NOTIFICATION) CHARGE/i,
    display: 'SMS ALERT CHARGE',
    reason: 'bank_fee',
  },
  {
    id: 'account_maintenance',
    pattern: /ACCOUNT MAINTENANCE/i,
    display: 'ACCOUNT MAINTENANCE FEE',
    reason: 'bank_fee',
  },
  {
    id: 'transaction_charge',
    pattern: /(TRANSACTION|PERIODIC) CHARGE/i,
    display: 'TRANSACTION CHARGE',
    reason: 'bank_fee',
  },
  {
    id: 'fixed_charge',
    pattern: /FIXED CHARGE/i,
    display: 'FIXED CHARGE',
    reason: 'bank_fee',
  },
  {
    id: 'stamp_duty',
    pattern: /STAMP DUTY/i,
    display: 'STAMP DUTY',
    reason: 'bank_fee',
  },
  {
    id: 'emt_levy',
    pattern: /EMT\s+LEVY/i,
    display: 'EMT LEVY',
    reason: 'bank_fee',
  },
  {
    id: 'nip_fee',
    pattern: /\bNIPFEE\b/i,
    display: 'NIP PROCESSING FEE',
    reason: 'bank_fee',
  },
  {
    id: 'nip_commission',
    pattern: /NIP TRANSFER COMMISSION/i,
    display: 'NIP TRANSFER COMMISSION',
    reason: 'bank_fee',
  },
  {
    id: 'reference_letter',
    pattern: /REF\.?\s*LETTER CHARGE/i,
    display: 'REFERENCE LETTER CHARGE',
    reason: 'bank_fee',
  },
  {
    id: 'cheque_commission',
    pattern: /CHEQUE .*CHARGE|CHEQUE .*COMMISSION/i,
    display: 'CHEQUE HANDLING CHARGE',
    reason: 'bank_fee',
  },
];

const VAT_PREFIX_RE =
  /^\s*(?:NIPVAT|VAT|VALUE ADDED TAX|TRANSFER OUT-?\s*VAT)/i;
const VAT_CONTEXT_RE = /\b(CHARGE|FEE|LEVY|MAINTENANCE|STAMP|NIP)\b/i;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const contactPatternsPath = join(__dirname, '../data/contact-patterns.json');

type CountryPatternEntry = {
  bank_fee_rules?: Array<{
    id: string;
    pattern: string;
    display: string;
    reason?: Extract<HeuristicReason, 'bank_fee' | 'tax'>;
  }>;
  structured_patterns?: Array<{
    id: string;
    pattern: string;
    direction: 'inbound' | 'outbound';
    group?: number;
  }>;
  transfer_markers?: string[];
  vat_rules?: VatRuleConfig;
};

type CountryPatternFile = Record<string, CountryPatternEntry>;
type BankFeeRuleConfig = NonNullable<
  CountryPatternEntry['bank_fee_rules']
>[number];
type StructuredPatternConfig = NonNullable<
  CountryPatternEntry['structured_patterns']
>[number];

type VatRuleConfig = {
  default_behavior?: 'fee_surcharge' | 'tax_payment';
  max_fee_vat_amount?: number;
  fee_keywords?: string[];
};

type VatRuleResolved = {
  defaultBehavior: 'fee_surcharge' | 'tax_payment';
  maxFeeVatAmount?: number;
  feeKeywords: string[];
};

interface CountryPatternBundle {
  bankFeeRules: SyntheticRule[];
  structuredPatterns: StructuredPattern[];
  transferRegex: RegExp;
  vatRules?: VatRuleResolved;
}

let countryPatternFile: CountryPatternFile = {};
try {
  const raw = readFileSync(contactPatternsPath, 'utf-8');
  const parsed = JSON.parse(raw) as CountryPatternFile;
  const normalized: CountryPatternFile = {};
  for (const [key, value] of Object.entries(parsed)) {
    normalized[key.toUpperCase()] = value;
  }
  countryPatternFile = normalized;
} catch (error) {
  console.warn('Failed to load contact pattern overrides', error);
}

const countryPatternCache = new Map<string, CountryPatternBundle>();

const BASE_STRUCTURED_PATTERNS: StructuredPattern[] = [
  {
    id: 'sender_metadata',
    regex: /SENDER[: ]+([A-Z0-9 .,'()&/-]{3,160})/i,
    direction: 'inbound',
  },
  {
    id: 'beneficiary_metadata',
    regex: /BENEFICIARY[: ]+([A-Z0-9 .,'()&/-]{3,160})/i,
    direction: 'outbound',
  },
  {
    id: 'transfer_between_to',
    regex:
      /TRANSFER\s+BETWEEN\s+CUSTOMERS[^A-Z0-9]*TO\s+([A-Z0-9 .,'()&/-]{3,160})/i,
    direction: 'outbound',
  },
  {
    id: 'transfer_between_from',
    regex:
      /TRANSFER\s+BETWEEN\s+CUSTOMERS[^A-Z0-9]*FROM\s+([A-Z0-9 .,'()&/-]{3,160})/i,
    direction: 'inbound',
  },
  {
    id: 'transfer_ifo',
    regex: /\bTRANSFER\s+(?:IFO|TO)[: ]+([A-Z0-9 .,'()&/-]{3,160})/i,
    direction: 'outbound',
  },
  {
    id: 'sterlingpro_to',
    regex: /STERLINGPRO\s+TRANSFER\s+TO\s+([A-Z0-9 .,'()&/-]{3,160})(?=\(|$)/i,
    direction: 'outbound',
  },
  {
    id: 'nip_ifo',
    regex: /\bNIP\s+(?:IFO|TO)\s+([A-Z0-9 .,'()&/-]{3,160})/i,
    direction: 'outbound',
  },
  {
    id: 'nip_frm',
    regex: /\bNIP\s+(?:FROM|FRM)\s+([A-Z0-9 .,'()&/-]{3,160})/i,
    direction: 'inbound',
  },
  {
    id: 'generic_frm',
    regex: /\bFRM\s+([A-Z0-9 .,'()&/-]{3,160})/i,
    direction: 'inbound',
  },
  {
    id: 'cash_deposit',
    regex: /CASH\s+DEPOSIT\s+([A-Z0-9 .,'()&/-]{3,160})/i,
    direction: 'inbound',
  },
  {
    id: 'cash_deposit_from',
    regex: /CASH\s+DEPOSIT.*?(?:FRM|FROM|BY)\s+([A-Z0-9 .,'()&/-]{3,160})/i,
    direction: 'inbound',
  },
  {
    id: 'cheque_deposit_from',
    regex: /CHEQUE\s+DEPOSIT.*?(?:FRM|FROM|BY)\s+([A-Z0-9 .,'()&/-]{3,160})/i,
    direction: 'inbound',
  },
];

const BASE_TRANSFER_MARKERS = [
  'NIP',
  'NIBSS',
  'TRANSFER',
  'TRF',
  'STERLINGPRO',
];

const DEFAULT_VAT_RULES: VatRuleResolved = {
  defaultBehavior: 'tax_payment',
  feeKeywords: ['CHARGE', 'FEE', 'MAINTENANCE', 'SMS', 'NOTIFICATION'],
};

export function resolveDescriptionHeuristics({
  companyId,
  description,
  aliasInfo,
  preferredContactType,
  countryCode,
  transactionAmount,
}: HeuristicArgs): HeuristicResolution {
  const patternBundle = getCountryPatternBundle(countryCode);
  const normalized = collapseWhitespace(description ?? '');

  if (!normalized) {
    return buildFallbackContact({
      companyId,
      description: normalized,
      preferredContactType,
    });
  }

  const synthetic = detectSyntheticContact({
    description: normalized,
    bankFeeRules: patternBundle.bankFeeRules,
    vatRules: patternBundle.vatRules,
    transactionAmount,
  });
  if (synthetic) {
    return synthetic;
  }

  const structured = extractStructuredCounterparty({
    description: normalized,
    aliasInfo,
    structuredPatterns: patternBundle.structuredPatterns,
  });
  if (structured) {
    return structured;
  }

  const heuristicName = extractContactFromDescription(normalized);
  if (heuristicName && !looksLikeCompanyAlias(heuristicName, aliasInfo)) {
    return {
      contactName: heuristicName,
      contactType: preferredContactType,
      confidence: 'low',
      reason: 'heuristic',
    };
  }

  const selfTransfer = detectSelfTransfer({
    aliasInfo,
    companyId,
    description: normalized,
    transferRegex: patternBundle.transferRegex,
  });

  if (selfTransfer) {
    return selfTransfer;
  }

  return buildFallbackContact({
    companyId,
    description: normalized,
    preferredContactType,
  });
}

// buildAliasMatcher builds (and caches) the base alias set for a company from relatively static sources
export function buildAliasMatcher({
  aliases,
  primaryDisplayName,
}: {
  aliases: string[];
  primaryDisplayName: string | null;
}): AliasMatcher {
  const normalizedAliases = aliases
    .map(normalizeComparableName)
    .filter(Boolean);

  const simpleAliases = aliases.map(normalizeSimpleAlias).filter(Boolean);

  return {
    comparableAliases: dedupe(normalizedAliases),
    simpleAliases: dedupe(simpleAliases),
    primaryDisplayName,
  };
}

export function extendAliasMatcher(
  base: AliasMatcher,
  extras: Array<string | null | undefined>,
): AliasMatcher {
  const extraComparable = extras
    .map(normalizeComparableName)
    .filter(Boolean) as string[];
  const extraSimple = extras
    .map(normalizeSimpleAlias)
    .filter(Boolean) as string[];

  if (extraComparable.length === 0 && extraSimple.length === 0) {
    return base;
  }

  return {
    comparableAliases: dedupe([...base.comparableAliases, ...extraComparable]),
    simpleAliases: dedupe([...base.simpleAliases, ...extraSimple]),
    primaryDisplayName: base.primaryDisplayName,
  };
}

export function looksLikeCompanyAlias(
  candidate: string,
  aliasInfo: AliasMatcher,
): boolean {
  const normalizedCandidate = normalizeComparableName(candidate);
  if (!normalizedCandidate) return false;

  return aliasInfo.comparableAliases.some((alias) => {
    if (!alias) return false;
    return (
      normalizedCandidate === alias ||
      normalizedCandidate.startsWith(alias) ||
      alias.startsWith(normalizedCandidate)
    );
  });
}

function detectSyntheticContact({
  description,
  bankFeeRules,
  vatRules,
  transactionAmount,
}: {
  description: string;
  bankFeeRules: SyntheticRule[];
  vatRules?: VatRuleResolved;
  transactionAmount?: number | null;
}): HeuristicResolution | null {
  for (const rule of bankFeeRules) {
    if (rule.pattern.test(description)) {
      return {
        contactName: `BANK FEE · ${rule.display}`,
        contactType: 'vendor',
        confidence: 'medium',
        fingerprintSeed: `bank_fee:${rule.id}`,
        reason: rule.reason,
      };
    }
  }

  const vatResolution = classifyVatLine({
    description,
    transactionAmount,
    vatRules,
  });
  if (vatResolution) {
    return vatResolution;
  }

  return null;
}

function extractStructuredCounterparty({
  description,
  aliasInfo,
  structuredPatterns,
}: {
  description: string;
  aliasInfo: AliasMatcher;
  structuredPatterns: StructuredPattern[];
}): HeuristicResolution | null {
  for (const pattern of structuredPatterns) {
    const match = pattern.regex.exec(description);
    if (!match) {
      continue;
    }

    const raw = match[pattern.group ?? 1];
    const cleaned = cleanCapturedName(raw);
    if (!cleaned) {
      continue;
    }

    if (looksLikeCompanyAlias(cleaned, aliasInfo)) {
      continue;
    }

    return {
      contactName: cleaned,
      contactType: pattern.direction === 'inbound' ? 'customer' : 'vendor',
      confidence: 'medium',
      reason: 'structured',
    };
  }

  return null;
}

function detectSelfTransfer({
  description,
  aliasInfo,
  companyId,
  transferRegex,
}: {
  description: string;
  aliasInfo: AliasMatcher;
  companyId: string;
  transferRegex: RegExp;
}): HeuristicResolution | null {
  if (!transferRegex.test(description)) {
    return null;
  }

  const upperDescription = description.toUpperCase();
  const mentionsCompany = aliasInfo.simpleAliases.some(
    (alias) => alias && upperDescription.includes(alias),
  );

  if (!mentionsCompany) {
    return null;
  }

  const label = aliasInfo.primaryDisplayName ?? 'Self Transfer';
  return {
    contactName: `SELF TRANSFER · ${label}`,
    contactType: 'internal',
    confidence: 'low',
    fingerprintSeed: `self-transfer:${companyId}`,
    reason: 'self_transfer',
  };
}

function buildFallbackContact({
  description,
  preferredContactType,
  companyId,
}: {
  description: string;
  preferredContactType: EnrichmentContactType;
  companyId: string;
}): HeuristicResolution {
  const subject = deriveFallbackSubject(description);
  return {
    contactName: `UNIDENTIFIED · ${subject}`,
    contactType: preferredContactType,
    confidence: 'low',
    fingerprintSeed: `fallback:${companyId}:${normalizeKey(subject)}`,
    reason: 'fallback',
  };
}

function extractVatSubject(description: string): string {
  const trimmed = description.trim();
  const match = trimmed.match(/VAT(?:\s+ON)?\s*([A-Z0-9 .,'()/:-]{3,160})/i);
  const subject = match?.[1] ?? trimmed;
  return deriveFallbackSubject(subject);
}

function deriveFallbackSubject(input: string): string {
  const sanitized = input
    .replace(/\d+/g, ' ')
    .replace(/[\\/|*_()[\]:-]+/g, ' ')
    .replace(/\b(PAYREF|REF|REMARK|SENDER)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) {
    return 'UNKNOWN COUNTERPARTY';
  }

  return sanitized.slice(0, 80);
}

function classifyVatLine({
  description,
  transactionAmount,
  vatRules,
}: {
  description: string;
  transactionAmount?: number | null;
  vatRules?: VatRuleResolved;
}): HeuristicResolution | null {
  const containsVat =
    /\bVAT\b/i.test(description) || /^\s*NIPVAT/i.test(description);
  if (
    !containsVat ||
    !(VAT_PREFIX_RE.test(description) || VAT_CONTEXT_RE.test(description))
  ) {
    return null;
  }

  const normalizedDesc = description.toUpperCase();
  const resolvedRules = vatRules ?? DEFAULT_VAT_RULES;
  const feeKeywords = resolvedRules.feeKeywords.length
    ? resolvedRules.feeKeywords
    : DEFAULT_VAT_RULES.feeKeywords;

  const keywordHit = feeKeywords.some((keyword) =>
    normalizedDesc.includes(keyword.toUpperCase()),
  );
  const amountWithinThreshold =
    transactionAmount == null ||
    resolvedRules.maxFeeVatAmount == null ||
    Math.abs(transactionAmount) <= resolvedRules.maxFeeVatAmount;

  const qualifiesAsSurcharge = keywordHit && amountWithinThreshold;
  let classification: 'fee_surcharge' | 'tax_payment';
  if (qualifiesAsSurcharge) {
    classification = 'fee_surcharge';
  } else if (
    resolvedRules.defaultBehavior === 'fee_surcharge' &&
    (!keywordHit || !amountWithinThreshold)
  ) {
    classification = 'tax_payment';
  } else {
    classification = resolvedRules.defaultBehavior;
  }

  const subject = extractVatSubject(description);
  const key = normalizeKey(subject);

  if (classification === 'fee_surcharge') {
    return {
      contactName: `BANK FEE TAX · ${subject}`,
      contactType: 'vendor',
      confidence: 'medium',
      fingerprintSeed: `tax_on_fee:${key}`,
      reason: 'tax',
    };
  }

  return {
    contactName: `TAX PAYMENT · ${subject}`,
    contactType: 'vendor',
    confidence: 'medium',
    fingerprintSeed: `tax_payment:${key}`,
    reason: 'tax',
  };
}

export function normalizeComparableName(value?: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFKC')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\(.*?\)/g, (segment) =>
      /ACCT|AC\/?C|AC\/?CT/i.test(segment) ? '' : segment,
    )
    .replace(/\bAC\/?CT[0-9A-Z -]*\b/gi, '')
    .replace(/\bAC\/?C(?:OUNT)?\b\.?\s*(?:NO|NUMBER)?\s*[0-9-]*/gi, '')
    .replace(/[^A-Z0-9& ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeSimpleAlias(value?: string | null): string {
  if (!value) return '';
  return collapseWhitespace(value).toUpperCase();
}

function cleanCapturedName(value?: string | null): string {
  if (!value) return '';
  let cleaned = value
    .replace(/PAYREF[:\s-]*[A-Z0-9-]+/gi, '')
    .replace(/REF[:\s-]*[A-Z0-9-]+/gi, '')
    .replace(/REM(?:ARK)?:.*$/i, '')
    .replace(/\bSENDER[: ]+.*/i, '')
    .replace(/\bAC\/?CT[0-9A-Z -]*\b/gi, '')
    .replace(/\(ACCT[^)]*\)/gi, '')
    .replace(/\/[0-9A-Z]{2,}$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = cleaned.replace(/[^A-Z0-9&'(). ]+/gi, ' ').replace(/\s+/g, ' ');
  cleaned = cleaned.trim();

  if (!/[A-Z]/i.test(cleaned)) {
    return '';
  }

  if (cleaned.length > 120) {
    return cleaned.slice(0, 120).trim();
  }

  return cleaned;
}

function normalizeKey(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  );
}

function collapseWhitespace(value: string): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    if (!seen.has(value)) {
      seen.add(value);
    }
  }
  return Array.from(seen);
}

function getCountryPatternBundle(
  countryCode?: string | null,
): CountryPatternBundle {
  const key = countryCode?.toUpperCase() || 'DEFAULT';
  if (countryPatternCache.has(key)) {
    return countryPatternCache.get(key)!;
  }

  const configEntries: CountryPatternEntry[] = [];
  if (countryPatternFile.DEFAULT) {
    configEntries.push(countryPatternFile.DEFAULT);
  }
  if (key !== 'DEFAULT' && countryPatternFile[key]) {
    configEntries.push(countryPatternFile[key]);
  }

  const extraBankFees = configEntries.flatMap((entry) =>
    (entry.bank_fee_rules ?? [])
      .map(compileBankFeeRule)
      .filter((rule): rule is SyntheticRule => Boolean(rule)),
  );

  const extraStructured = configEntries.flatMap((entry) =>
    (entry.structured_patterns ?? [])
      .map(compileStructuredPattern)
      .filter((pattern): pattern is StructuredPattern => Boolean(pattern)),
  );

  const extraMarkers = configEntries.flatMap(
    (entry) => entry.transfer_markers ?? [],
  );

  const vatRules = resolveVatRules(
    configEntries.map((entry) => entry.vat_rules),
  );

  const bundle: CountryPatternBundle = {
    bankFeeRules: BASE_BANK_FEE_RULES.concat(extraBankFees),
    structuredPatterns: BASE_STRUCTURED_PATTERNS.concat(extraStructured),
    transferRegex: buildTransferRegex(
      BASE_TRANSFER_MARKERS.concat(extraMarkers),
    ),
    vatRules,
  };

  countryPatternCache.set(key, bundle);
  return bundle;
}

function compileBankFeeRule(config: BankFeeRuleConfig): SyntheticRule | null {
  try {
    return {
      id: config.id,
      display: config.display,
      reason: config.reason ?? 'bank_fee',
      pattern: new RegExp(config.pattern, 'i'),
    };
  } catch (error) {
    console.warn('Failed to compile bank fee rule', config, error);
    return null;
  }
}

function compileStructuredPattern(
  config: StructuredPatternConfig,
): StructuredPattern | null {
  try {
    return {
      id: config.id,
      regex: new RegExp(config.pattern, 'i'),
      direction: config.direction,
      group: config.group,
    };
  } catch (error) {
    console.warn('Failed to compile structured pattern', config, error);
    return null;
  }
}

function buildTransferRegex(markers: string[]): RegExp {
  const sanitized = Array.from(
    new Set(
      markers
        .map((marker) => marker?.trim())
        .filter((marker): marker is string => Boolean(marker)),
    ),
  );
  if (sanitized.length === 0) {
    return /\bTRANSFER\b/i;
  }

  const escaped = sanitized.map(escapeRegex);
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveVatRules(
  entries: Array<VatRuleConfig | undefined>,
): VatRuleResolved {
  let resolved: VatRuleResolved | null = null;

  for (const entry of entries) {
    if (!entry) continue;

    if (!resolved) {
      resolved = {
        defaultBehavior:
          entry.default_behavior ?? DEFAULT_VAT_RULES.defaultBehavior,
        maxFeeVatAmount:
          entry.max_fee_vat_amount ?? DEFAULT_VAT_RULES.maxFeeVatAmount,
        feeKeywords: entry.fee_keywords ?? DEFAULT_VAT_RULES.feeKeywords,
      };
      continue;
    }

    if (entry.default_behavior) {
      resolved.defaultBehavior = entry.default_behavior;
    }
    if (entry.max_fee_vat_amount !== undefined) {
      resolved.maxFeeVatAmount = entry.max_fee_vat_amount;
    }
    if (entry.fee_keywords?.length) {
      resolved.feeKeywords = entry.fee_keywords;
    }
  }

  return (
    resolved ?? {
      ...DEFAULT_VAT_RULES,
    }
  );
}
