import { z } from 'zod';
import { categorizationTaskSource } from '../tasks/tasks.enums.js';
import {
  accountingBasis,
  companyType,
  reportingFramework,
} from '../../companies/companies.types.js';
import { contactType } from '../../contacts/index.js';
import {
  enrichedTransaction,
  type EnrichedTransaction,
} from '@accountable-books/contracts/schema';

export { type EnrichedTransaction };
export { enrichedTransaction };

// ============================================
// ENRICHMENT JOB DATA
// ============================================

export const enrichmentJobDataSchema = z.object({
  companyId: z.uuid(),
  bankAccountId: z.uuid(),
  bankTransactionIds: z.array(z.uuid()).min(1),
  source: categorizationTaskSource,
});

export type EnrichmentJobData = z.infer<typeof enrichmentJobDataSchema>;

const enrichmentProcessingType = z.enum(['primary', 'shadow']);
export type EnrichmentProcessingType = z.infer<typeof enrichmentProcessingType>;

export const enrichmentContactType = contactType.or(z.literal('unknown'));
export type EnrichmentContactType = z.infer<typeof enrichmentContactType>;
export const contactMatchConfidence = z.enum([
  'high',
  'medium',
  'low',
  'unmatched',
]);
export type ContactMatchConfidence = z.infer<typeof contactMatchConfidence>;
export const contactResolutionResult = z.object({
  contact_id: z.string().nullable(),
  contact_name: z.string().nullable(),
  contact_fingerprint: z.string(),
  contact_match_confidence: contactMatchConfidence,
  contact_type: enrichmentContactType,
  global_contact_name: z.string().nullish(),
  mcc: z.string().nullish(),
  global_contact_category_hints: z.array(z.string()).nullish(),
});
export type ContactResolutionResult = z.infer<typeof contactResolutionResult>;
// ============================================
// COMPANY CONTEXT CACHE
// ============================================

export const companyContextCache = z.object({
  company_uuid: z.string(),
  display_name: z.string(),
  legal_name: z.string().nullish(),
  type: companyType,
  description: z.string().nullish(),
  website: z.string().nullish(),
  country_id: z.string(),
  country_code: z.string(),
  region_code: z.string().nullish(),
  subregion_code: z.string().nullish(),
  industry: z.string().optional(),
  tags: z.array(z.string()).default([]),
  company_size: z.string().optional(),
  accounting_basis: accountingBasis,
  reporting_framework: z.union([reportingFramework, z.literal('other')]),
  reporting_currency_id: z.string(),
  reporting_currency_code: z.string().length(3),
  year_end_day: z.number(),
  year_end_month: z.number(),
  default_timezone: z.string(),
  company_settings_checksum: z.string(),
  coa_snapshot_version: z.string(),
  coa_snapshot_id: z.string(),
  coa_snapshot_checksum: z.string().optional(),
  cached_at: z.date(),
});

export type CompanyContextCache = z.infer<typeof companyContextCache>;
// const enrichmentCompanyContext = companyContextCache
//   .omit({
//     display_name: true,
//     legal_name: true,
//     year_end_month: true,
//     year_end_day: true,
//   })
//   .extend({
//     company_name: z.string(),
//   });

const baseRollingStats = z.object({
  transaction_count: z.number().int().nonnegative(),
  amount_native_sum: z.number(),
  avg_amount_native: z.number(),
  stddev_amount_native: z.number(),

  amount_reporting_sum: z.number(), // Remove from enrichment... legacy
  avg_amount_reporting: z.number(),
  stddev_amount_reporting: z.number(),
});

export const baseContactStats = z.object({
  stats_row_id: z.string().nullable(),
  totals: baseRollingStats,
  rolling_30d: baseRollingStats,
  rolling_90d: baseRollingStats,
  last_transaction_id: z.string().nullable(),
  last_transaction_date: z.iso.date().nullable(),
  stats_replay_seq: z.number().int().nonnegative(),
  stats_snapshot_checksum: z.string().nullish(),
  snapshot_captured_at: z.iso.date().nullable(),
});
export type BaseContactStats = z.infer<typeof baseContactStats>;

export const contactStats = baseContactStats.extend({
  as_of_transaction_id: z.string().nullable(),
  as_of_transaction_date: z.iso.date().nullable(),
});
export type ContactStats = z.infer<typeof contactStats>;

export const merchantPattern = z.object({
  name: z.string(),
  patterns: z.array(z.string()).min(1),
  countries: z.array(z.string()).min(1),
  category_hints: z.array(z.string()).min(1),
});

export const merchantPatternsFileSchema = z.object({
  version: z.string(),
  patterns: z.array(merchantPattern),
});

export type MerchantPattern = z.infer<typeof merchantPattern>;
export type MerchantPatternsFile = z.infer<typeof merchantPatternsFileSchema>;

export const mccStripeCategorySchema = z.object({
  key: z.string(),
  label: z.string(),
});

export const mccReferenceSchema = z.object({
  mcc: z.string().regex(/^\d{3,4}$/),
  title: z.string(),
  description: z.string(),
  category_hints: z.array(z.string()).min(1),
  examples: z.array(z.string()).optional(),
  similar_merchants: z.array(z.string()).optional(),
  stripe_categories: z.array(mccStripeCategorySchema).optional(),
  networks: z.array(z.string()).optional(),
  irs_reportable: z.boolean().optional(),
  usda_description: z.string().optional(),
  irs_description: z.string().optional(),
});

export const mccReferenceFileSchema = z
  .object({
    version: z.string(),
    sources: z.any(),
    mccs: z.array(mccReferenceSchema),
  })
  .catchall(z.any());

export type MccReference = z.infer<typeof mccReferenceSchema>;
export type MccReferenceFile = z.infer<typeof mccReferenceFileSchema>;

export type CompiledMerchantPattern = {
  merchant: MerchantPattern;
  regexes: RegExp[];
};

// ============================================
// ENRICHMENT RESULT
// ============================================

export interface EnrichmentStatsContext {
  contact_fingerprint: string | null;
  stats_row_id: string | null;
  stats_replay_seq: number;
  stats_snapshot_checksum: string | null;
  snapshot_captured_at: string | null;
  // Exchange rate metadata for stats calculation (from bank transaction's system_exchange_rate)
  exchange_rate: number;
  amount_reporting: number;
}

export interface EnrichmentResult {
  success: boolean;
  bankTransactionId: string;
  enrichedTransaction?: EnrichedTransaction;
  error?: string;
  latencyMs: number;
  statsContext?: EnrichmentStatsContext;
  checksum: string;
}

// ============================================
// PATTERN DETECTION
// ============================================

export interface PatternSignals {
  likely_split: boolean;
  likely_trf_btw_accounts: boolean;
  likely_tax: boolean;
  likely_fx: boolean;
  likely_prepayment: boolean;
  is_recurring: boolean;
  anomaly_detected: boolean;
  notes: string[];
  requires_vat_check?: boolean;
  requires_fx_review?: boolean;
}

const temporalSchema = z.object({
  day_of_week: z.int().min(0).max(6),
  day_of_month: z.int().min(1).max(31),
  calendar_month: z.int().min(1).max(12),
  calendar_quarter: z.int().min(1).max(4),
  fiscal_month: z.int().min(1).max(12),
  fiscal_quarter: z.int().min(1).max(4),
  fiscal_period: z.object({
    year_start: z.iso.date(),
    year_end: z.iso.date(),
    quarter_start: z.iso.date(),
    quarter_end: z.iso.date(),
    month_start: z.iso.date(),
    month_end: z.iso.date(),
  }),
});
export type Temporal = z.infer<typeof temporalSchema>;

export const enrichedTxRaw = z.object({
  date: z.iso.date(),
  description: z.string().nullable(),
  amount_native: z.number(),
  system_ex_rate: z.number(),
  amount_reporting: z.number(),
  reference: z.string().nullish(),
  currency_code: z.string().length(3),
  source: z.string(),
  metadata: z.any(),
});
export type EnrichedTxRaw = z.infer<typeof enrichedTxRaw>;

export const enrichedTxNormalized = z.object({
  description: z.string(),
  description_tokens: z.array(z.string()),
  contact_name: z.string().nullable(),
  contact_fingerprint: z.string().nullable(),
  contact_match_confidence: contactMatchConfidence,
  contact_type: contactType.or(z.literal('unknown')),
  normalized_reference: z.string().nullish(),
  global_contact_name: z.string().nullish(),
  global_contact_category_hints: z.array(z.string()).nullish(),
});
export type EnrichedTxNormalized = z.infer<typeof enrichedTxNormalized>;
