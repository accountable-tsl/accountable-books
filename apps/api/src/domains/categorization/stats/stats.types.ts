import z from 'zod';
import { dbBaseFields, zDateYMD } from '../../../core/index.js';

export const bcsBase = z.object({
  company_id: z.uuid(),
  contact_id: z.uuid().nullable(),
  currency_code: z.string().min(3).max(3),
  contact_name: z.string().max(256).nullish(),
  normalized_name: z.string().max(256).nullish(),
  contact_fingerprint: z.string().max(256).nullish(),
});

const bcsBaseMetrics = z.object({
  total_transactions: z.bigint(),
  total_amount_native: z.bigint(),
  total_amount_reporting: z.bigint(),
  avg_amount_native: z.bigint(),
  avg_amount_reporting: z.bigint(),
  std_dev_amount_native: z.bigint(),
  std_dev_amount_reporting: z.bigint(),
});

const bcsRollingWindow = z.object({
  rolling_30d_txn_count: z.bigint(),
  rolling_90d_txn_count: z.bigint(),

  rolling_30d_total_native: z.string(),
  rolling_30d_total_reporting: z.string(),

  rolling_30d_avg_native: z.string(),
  rolling_30d_avg_reporting: z.string(),
  rolling_30d_stddev_native: z.string(),
  rolling_30d_stddev_reporting: z.string(),

  rolling_90d_total_native: z.string(),
  rolling_90d_total_reporting: z.string(),

  rolling_90d_avg_native: z.string(),
  rolling_90d_avg_reporting: z.string(),
  rolling_90d_stddev_native: z.string(),
  rolling_90d_stddev_reporting: z.string(),
});

export const newBankTransactionContactStat = z.object({
  ...bcsBase.shape,
  ...bcsBaseMetrics.shape,
  ...bcsRollingWindow.shape,
  normalized_name: z.string().min(1).max(256),
  contact_fingerprint: z.string().min(1).max(256),
  last_transaction_id: z.uuid().nullish(),
  last_transaction_date: zDateYMD.nullish(),
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
