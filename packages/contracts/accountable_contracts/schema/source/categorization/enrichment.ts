import { z } from 'zod';

import {
  accountingBasis,
  companyType,
  contactType,
  reportingFramework,
} from '../common/enums.js';
import { categorizationTaskSource, categorizationTaskStatus } from './tasks.js';

const enrichmentProcessingType = z.enum(['primary', 'shadow']);

/**
 * Enrichment version identifier
 * Format: v{yymmdd}-{dto-version}-{major}.{minor}.{patch}
 * First part is the date of the release
 * Second part is EnrichedTransaction DTO version (we bump this up when we add/remove fields)
 * Also helps track if we're training multiple versions a day
 * Third part is semantic version for logic changes
 * E.g v240601-01-1.0.0
 */
export const versionPattern = /^v\d{6}-\d{2}-\d+\.\d+\.\d+$/;

export const baseRollingStats = z.object({
  transaction_count: z.number().int().nonnegative(),
  amount_native_sum: z.number(),
  avg_amount_native: z.number(),
  stddev_amount_native: z.number(),
  // amount_reporting_sum: z.number(),
  // avg_amount_reporting: z.number(),
  // stddev_amount_reporting: z.number(),
});

export const temporalSchema = z.object({
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
export type TemporalSchema = z.infer<typeof temporalSchema>;

export const companyContext = z.object({
  company_uuid: z.string(),
  company_name: z.string(),
  type: companyType,
  description: z.string().nullish(),
  website: z.string().nullish(),
  country_id: z.string(),
  country_code: z.string(),
  region_code: z.string().nullish(),
  subregion_code: z.string().nullish(),
  industry: z.string().optional(),
  tags: z.array(z.string()).default([]),
  accounting_basis: accountingBasis,
  reporting_framework: z.union([reportingFramework, z.literal('other')]),
  reporting_currency_code: z.string().length(3),
  year_end_day: z.number(),
  year_end_month: z.number(),
  default_timezone: z.string(),
  company_settings_checksum: z.string(),
  coa_snapshot_version: z.string(),
  coa_snapshot_id: z.string(),
  coa_snapshot_checksum: z.string().optional(),
  cached_at: z.iso.datetime(),
});
export type CompanyContext = z.infer<typeof companyContext>;

export const bankContactStatsSnapshot = z.object({
  stats_row_id: z.string().nullable(),
  totals: baseRollingStats,
  rolling_30d: baseRollingStats,
  rolling_90d: baseRollingStats,
  last_transaction_id: z.string().nullable(),
  last_transaction_date: z.iso.date().nullable(),
  stats_replay_seq: z.number().int().nonnegative(),
  stats_snapshot_checksum: z.string().nullish(),
  snapshot_captured_at: z.iso.date().nullable(),
  as_of_transaction_id: z.string().nullable(),
  as_of_transaction_date: z.iso.date().nullable(),
});
export type BankContactStatsSnapshot = z.infer<typeof bankContactStatsSnapshot>;

export const enrichedTransaction = z.object({
  version: z.regex(versionPattern), // v240601-01-1.0.0

  ids: z.object({
    bank_transaction_id: z.uuid(),
    bank_transaction_batch_id: z.uuid().nullish(),
    company_uuid: z.uuid(),
    bank_account_id: z.uuid(),
    bank_account_coa_id: z.uuid(),

    bank_account_currency_code: z.string().length(3),

    contact_id: z.uuid().nullish(),
    enrichment_job_id: z.string().nullish(),
  }),

  raw: z.object({
    date: z.iso.date(),
    description: z.string().nullable(),
    amount: z.number(), // signed amount in the bank account currency
    // system_ex_rate: z.number(),
    // amount_reporting: z.number(),
    currency_code: z.string().length(3),
    reference: z.string().nullish(),
    // direction: z.enum(['inflow', 'outflow']), - forces the model to learn two separate fields that are 100% mathematically linked.
    source: z.string(),
    metadata: z.any(),
  }),
  normalized: z.object({
    description: z.string(),
    description_tokens: z.array(z.string()),
    contact_name: z.string().nullable(),
    contact_fingerprint: z.string().nullable(),
    contact_match_confidence: z.enum(['high', 'medium', 'low', 'unmatched']),
    contact_type: contactType.or(z.literal('unknown')),
    normalized_reference: z.string().nullish(),
    global_contact_name: z.string().nullish(),
    global_contact_category_hints: z.array(z.string()).nullish(),
  }),

  context: companyContext,

  historical: z.object({
    bank_contact_stats_snapshot: bankContactStatsSnapshot.nullish(),
  }),

  signals: z.object({
    likely_split: z.boolean().optional(),
    likely_trf_btw_accounts: z.boolean(),
    notes: z.array(z.string()),
    requires_vat_check: z.boolean().optional(),
    requires_fx_review: z.boolean().optional(),
  }),

  temporal: temporalSchema.optional(),

  // TODO: Stage 1 leaves this undefined; populate once feedback stats flow feeds enrichment
  feedback_summary: z
    .object({
      last_posted_at: z.iso.date(),
      last_posted_coa_id: z.uuid().nullable(),
      acceptance_ratio_90d: z.number().min(0).max(1).nullable(),
      custom_exchange_rate: z.number().positive().nullish(),
      user_override_contact_id: z.uuid().nullish(),
      user_override_notes: z.string().nullish(),
    })
    .optional(),

  metadata: z.object({
    source: categorizationTaskSource,
    enriched_at: z.iso.datetime(),
    enrichment_latency_ms: z.int().nonnegative(),
    enrichment_version: z.string(),
    status: categorizationTaskStatus,
    error_message: z.string().nullish(),
    processing_context: enrichmentProcessingType.optional(),
    stats_replay_seq: z.number().int().nonnegative().optional(),
    replay_reason: z.string().optional(),
    recomputed_at: z.iso.datetime().optional(),
    stats_snapshot_checksum: z.string().nullish(),
  }),
});

export type EnrichedTransaction = z.infer<typeof enrichedTransaction>;
