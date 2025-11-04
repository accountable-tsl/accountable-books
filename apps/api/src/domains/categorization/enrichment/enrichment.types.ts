import { z } from 'zod';
import {
  categorizationTaskSource,
  categorizationTaskStatus,
} from '../tasks/tasks.types.js';
import {
  accountingBasis,
  companyType,
  reportingFramework,
} from '../../companies/companies.types.js';
import { contactType } from '../../contacts/index.js';

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

// ============================================
// CONTACT RESOLUTION
// ============================================

// export interface ContactResolutionResult {
//   contactId: string | null;
//   contactName: string | null;
//   contactFingerprint: string | null;
//   matchConfidence:
//     | 'exact_contact'
//     | 'alias_match'
//     | 'fingerprint_only'
//     | 'unmatched';
//   contactType:
//     | 'vendor'
//     | 'customer'
//     | 'employee'
//     | 'business_owner'
//     | 'individual_self'
//     | 'unknown';
//   globalContactId?: string | null;
//   globalContactCategoryHints?: string[] | null;
// }

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
  contact_fingerprint: z.string().nullable(),
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
  industry: z.string().optional(),
  accounting_basis: accountingBasis,
  reporting_framework: z.union([reportingFramework, z.literal('other')]),
  reporting_currency_id: z.string(),
  reporting_currency_code: z.string().length(3),
  year_end_day: z.number(),
  year_end_month: z.number(),
  default_timezone: z.string(),
  company_settings_checksum: z.string().optional(),
  coa_snapshot_version: z.string(),
  coa_snapshot_id: z.string(),
  coa_snapshot_checksum: z.string().optional(),
  cached_at: z.iso.datetime(),
});

export type CompanyContextCache = z.infer<typeof companyContextCache>;

// export interface CompanyContextCache {
//   companyId: string;
//   companyName: string;
//   countryId: string;
//   countryCode: string;
//   industry?: string;
//   accountingBasis: 'modified_cash_basis' | 'modified_accrual_basis';
//   reportingFramework: 'ifrs' | 'us_gaap' | 'other';
//   reportingCurrencyId: string;
//   reportingCurrencyCode: string;
//   fiscalYearEnd: string; // MM-DD format
//   defaultTimezone: string;
//   coaSnapshotVersion: string;
//   coaSnapshotId: string;
//   settingsChecksum: string;
//   cachedAt: string;
// }

// ============================================
// CONTACT STATS
// ============================================

// export interface ContactStats {
//   companyId: string;
//  ...
// }

export interface ContactStats {
  id: string;
  companyId: string;
  contactId: string | null;
  contactFingerprint: string;
  normalizedName: string;
  currencyCode: string;
  totalTransactions: number;
  totalAmountNative: number;
  totalAmountReporting: number;
  avgAmountNative: number;
  avgAmountReporting: number;
  stdDevAmountNative: number;
  stdDevAmountReporting: number;
  rolling30dTxnCount: number;
  rolling30dTotalNative: number;
  rolling30dTotalReporting: number;
  rolling30dAvgNative: number;
  rolling30dAvgReporting: number;
  rolling30dStddevNative: number;
  rolling30dStddevReporting: number;
  rolling90dTxnCount: number;
  rolling90dTotalNative: number;
  rolling90dTotalReporting: number;
  rolling90dAvgNative: number;
  rolling90dAvgReporting: number;
  rolling90dStddevNative: number;
  rolling90dStddevReporting: number;
  lastTransactionId: string | null;
  lastTransactionDate: string | null;
  statsSnapshotChecksum: string | null;
  statsReplaySeq: number;
  snapshotCapturedAt: string | null;
}

// ============================================
// MERCHANT PATTERNS
// ============================================

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
  contactFingerprint: string | null;
  statsRowId: string | null;
  snapshotChecksum: string | null;
  statsReplaySeq: number;
  snapshotCapturedAt: string | null;
}

export interface EnrichmentResult {
  success: boolean;
  bankTransactionId: string;
  enrichedTransaction?: EnrichedTransaction;
  error?: string;
  latencyMs: number;
  statsContext?: EnrichmentStatsContext;
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

// ============================================
// ENRICHED TRANSACTION SCHEMA
// ============================================

export const enrichedTransactionSchema = z.object({
  version: z.string(), // v240601-01-1.0.0

  ids: z.object({
    bank_transaction_id: z.uuid(),
    bank_transaction_batch_id: z.uuid().nullish(),
    company_uuid: z.uuid(),
    bank_account_id: z.uuid(),
    bank_account_coa_id: z.uuid(),
    contact_id: z.uuid().nullish(),
    enrichment_job_id: z.string().nullish(),
  }),

  raw: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().nullable(),
    amount_native: z.number(),
    system_ex_rate: z.number(),
    amount_reporting: z.number(),
    currency_code: z.string().length(3),
    direction: z.enum(['inflow', 'outflow']),
    source: z.string(),
    metadata: z.any(),
  }),

  normalized: z.object({
    description: z.string(),
    description_tokens: z.array(z.string()),
    contact_name: z.string().nullable(),
    contact_fingerprint: z.string().nullable(),
    contact_match_confidence: contactMatchConfidence,
    contact_type: contactType.or(z.literal('unknown')),
    normalized_reference: z.string().nullish(),
    global_contact_name: z.string().nullish(),
    global_contact_category_hints: z.array(z.string()).nullish(),
  }),

  context: z.object({
    industry: z.string().nullish(),
    company_name: z.string(),
    company_description: z.string().nullish(),
    company_website: z.string().nullish(),
    country_id: z.uuid(),
    country_code: z.string(),
    accounting_basis: accountingBasis,
    reporting_framework: z.union([reportingFramework, z.literal('other')]),
    reporting_currency_id: z.uuid(),
    reporting_currency_code: z.string().length(3),
    transaction_currency_id: z.uuid(),
    transaction_currency_code: z.string().length(3),
    coa_snapshot_version: z.string(),
    coa_snapshot_id: z.uuid(),
    company_settings_checksum: z.string().nullish(),
  }),

  // historical: z.object({
  //   // Houses bank transaction contact rolling window and count stats
  //   bank_contact_stats: z.object({
  //     id: z.uuid(),
  //     version: z.string(),
  //   }),
  // }),
  historical: z.object({
    bank_contact_stats_snapshot: z
      .object({
        stats_row_id: z.uuid().nullable(),
        captured_at: z.string().datetime(),
        as_of_transaction_id: z.uuid().nullable(),
        as_of_transaction_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        stats_replay_seq: z.number().int().nonnegative(),
        checksum: z.string(),
        totals: z.object({
          transaction_count: z.number().int().nonnegative(),
          amount_native_sum: z.number(),
          amount_reporting_sum: z.number(),
          avg_amount_native: z.number(),
          avg_amount_reporting: z.number(),
          stddev_amount_native: z.number(),
          stddev_amount_reporting: z.number(),
        }),
        rolling_30d: z.object({
          transaction_count: z.number().int().nonnegative(),
          amount_native_sum: z.number(),
          amount_reporting_sum: z.number(),
          avg_amount_native: z.number(),
          avg_amount_reporting: z.number(),
          stddev_amount_native: z.number(),
          stddev_amount_reporting: z.number(),
        }),
        rolling_90d: z.object({
          transaction_count: z.number().int().nonnegative(),
          amount_native_sum: z.number(),
          amount_reporting_sum: z.number(),
          avg_amount_native: z.number(),
          avg_amount_reporting: z.number(),
          stddev_amount_native: z.number(),
          stddev_amount_reporting: z.number(),
        }),
        last_transaction_id: z.uuid().nullable(),
        last_transaction_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
      })
      .nullable(),
  }),

  signals: z.object({
    likely_split: z.boolean(),
    likely_trf_btw_accounts: z.boolean(),
    notes: z.array(z.string()),
    requires_vat_check: z.boolean().optional(),
    requires_fx_review: z.boolean().optional(),
  }),

  temporal: z.object({
    day_of_week: z.int().min(1).max(7),
    day_of_month: z.int().min(1).max(31),
    month: z.int().min(1).max(12),
    quarter: z.int().min(1).max(4),
    fiscal_quarter: z.int().min(1).max(4),
    days_to_period_close: z.int().nonnegative(),
    is_month_end: z.boolean(), // few days to end of acc month
    is_year_end: z.boolean(), // few days to end of fiscal year
    fiscal_period: z.object({
      year_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      year_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      quarter_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      quarter_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      month_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      month_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  }),

  feedback_summary: z
    .object({
      last_posted_at: z.string().datetime().nullable(),
      last_posted_coa_id: z.uuid().nullable(),
      acceptance_ratio_90d: z.number().min(0).max(1).nullable(),
      custom_exchange_rate: z.number().positive().nullish(),
      user_override_contact_id: z.uuid().nullish(),
      user_override_notes: z.string().nullish(),
    })
    .optional(),

  metadata: z.object({
    source: categorizationTaskSource,
    enriched_at: z.string().datetime(),
    enrichment_latency_ms: z.int().nonnegative(),
    enrichment_version: z.string(),
    status: categorizationTaskStatus,
    error_message: z.string().nullish(),
    processing_context: z.enum(['primary', 'shadow']).optional(),
    stats_replay_seq: z.number().int().nonnegative().optional(),
    replay_reason: z.string().optional(),
    recomputed_at: z.string().datetime().optional(),
    stats_snapshot_checksum: z.string().optional(),
  }),
});

export type EnrichedTransaction = z.infer<typeof enrichedTransactionSchema>;
