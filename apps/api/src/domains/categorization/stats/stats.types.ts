import z from 'zod';

import { dbBaseFields, zDateYMD } from '../../../core/index.js';
import {
  enrichedTxNormalized,
  enrichedTxRaw,
} from '../enrichment/enrichment.types.js';

const bigintOrNumber = z.union([z.bigint(), z.number()]);
export const bcsBase = z.object({
  company_id: z.uuid(),
  contact_id: z.uuid().nullable(),
  currency_code: z.string().min(3).max(3),
  normalized_name: z.string().max(256).nullish(),
  contact_fingerprint: z.string().max(256).nullish(),
});

const bcsBaseMetrics = z.object({
  total_transactions: z.int(),
  total_amount_native: bigintOrNumber,
  total_amount_reporting: bigintOrNumber,
  avg_amount_native: bigintOrNumber,
  avg_amount_reporting: bigintOrNumber,
  std_dev_amount_native: bigintOrNumber,
  std_dev_amount_reporting: bigintOrNumber,
  total_sumsq_native: bigintOrNumber,
  total_sumsq_reporting: bigintOrNumber,
});
export type BCSBaseMetrics = z.infer<typeof bcsBaseMetrics>;

const bcsRollingWindow = z.object({
  rolling_30d_txn_count: z.int(),
  rolling_90d_txn_count: z.int(),

  rolling_30d_total_native: bigintOrNumber,
  rolling_30d_total_reporting: bigintOrNumber,

  rolling_30d_sumsq_native: bigintOrNumber,
  rolling_30d_sumsq_reporting: bigintOrNumber,

  rolling_30d_avg_native: bigintOrNumber,
  rolling_30d_avg_reporting: bigintOrNumber,
  rolling_30d_stddev_native: bigintOrNumber,
  rolling_30d_stddev_reporting: bigintOrNumber,

  rolling_90d_total_native: bigintOrNumber,
  rolling_90d_total_reporting: bigintOrNumber,

  rolling_90d_sumsq_native: bigintOrNumber,
  rolling_90d_sumsq_reporting: bigintOrNumber,

  rolling_90d_avg_native: bigintOrNumber,
  rolling_90d_avg_reporting: bigintOrNumber,
  rolling_90d_stddev_native: bigintOrNumber,
  rolling_90d_stddev_reporting: bigintOrNumber,
});

export type BCSRollingWindow = z.infer<typeof bcsRollingWindow>;

export type BCSAllMetrics = BCSBaseMetrics & BCSRollingWindow;

export const newBankTransactionContactStat = z.object({
  ...bcsBase.shape,
  ...bcsBaseMetrics.shape,
  ...bcsRollingWindow.shape,
  normalized_name: z.string().min(1).max(256),
  contact_fingerprint: z.string().min(1).max(256),
  last_transaction_id: z.uuid().nullish(),
  last_transaction_date: zDateYMD.nullish(),
  stats_replay_seq: z.int().nonnegative(),
  stats_snapshot_checksum: z.string().nullish(),
  snapshot_captured_at: zDateYMD.nullish(),
});
export type NewBankTransactionContactStat = z.infer<
  typeof newBankTransactionContactStat
>;

export const bankTransactionContactStat = z.object({
  ...newBankTransactionContactStat.shape,
  ...dbBaseFields.shape,
});
export type BankTransactionContactStat = z.infer<
  typeof bankTransactionContactStat
>;

const newStatEntry = z.object({
  stats_id: z.string(),
  company_id: z.string(),
  contact_id: z.string().nullable(),
  currency_code: z.string(),
  contact_fingerprint: z.string(),

  bank_transaction_id: z.string(),
  bank_transaction_date: zDateYMD,

  native_amount_abs: z.number(),
  reporting_amount_abs: z.number(),

  stats_snapshot_checksum: z.string().nullable(),
  stats_replay_seq: z.number().default(0),
});

export type NewStatEntry = z.infer<typeof newStatEntry>;

export const statEntry = z.object({
  ...newStatEntry.shape,
  ...dbBaseFields.shape,
});
export type StatEntry = z.infer<typeof statEntry>;

export const incrementStatsParams = z.object({
  ...enrichedTxRaw.shape,
  ...enrichedTxNormalized.shape,
  company_uuid: z.uuid(),
  contact_id: z.uuid().optional(),
  contact_fingerprint: z.string(),
  bank_transaction_id: z.string(),
  bank_transaction_date: zDateYMD,
  stats_replay_seq: z.number().default(0),
  stats_snapshot_checksum: z.string().nullish(),
});
export type IncrementStats = z.infer<typeof incrementStatsParams>;
