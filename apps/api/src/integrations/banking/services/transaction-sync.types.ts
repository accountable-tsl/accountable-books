import type { BankTransactionSyncRunTrigger } from '../../../domains/banking/bank-transaction-sync-runs/bank-transaction-sync-runs.types.js';
import type { ProviderHistoryStatus } from '../types/base.js';

export type TransactionSyncTrigger =
  | 'initial'
  | 'periodic'
  | 'manual'
  | 'webhook';

/** Maps API triggers onto bank_transaction_sync_runs.trigger. */
export const TRANSACTION_SYNC_RUN_TRIGGER: Record<
  TransactionSyncTrigger,
  BankTransactionSyncRunTrigger
> = {
  initial: 'initial_connection',
  periodic: 'scheduler',
  manual: 'manual',
  webhook: 'webhook',
};

export interface TransactionSyncCommand {
  bankAccountId: string;
  trigger: TransactionSyncTrigger;
  actorUserId?: string;
}

export interface BankAccountSyncResult {
  bankAccountId: string;
  outcome: 'completed' | 'not_ready' | 'unsupported';
  initialSync: boolean;
  /** Present on completed syncs; how far the provider's history preparation got. */
  historyStatus?: ProviderHistoryStatus;
  added: number;
  modified: number;
  removed: number;
}

export interface BankAccountForSync {
  bank_account_id: string;
  feed_id: string;
  company_id: string;
  bank_connection_id: string;
  provider_account_id: string;
  sync_cursor: string | null;
  sync_from_date: Date | null;
  initial_sync_completed_at: Date | null;
  last_successful_sync_at: Date | null;
  state_version: number;
  is_deleted: boolean;
  replaces_bank_account_feed_id: string | null;
  replacement_reconciliation_completed_at: Date | null;
  /** Predecessor feed window when this feed is mid-replacement reconciliation. */
  predecessor_sync_from_date: Date | null;
  predecessor_last_successful_sync_at: Date | null;
}

/** Classification counts produced when one provider update is applied. */
export interface AppliedTransactionUpdateCounts {
  /** Observations classified as new and imported or quarantined. */
  added: number;
  /** Observations of known transactions: evidence refreshes, supersedes, candidate updates. */
  modified: number;
  /** Removal events that matched a stored transaction or candidate. */
  removed: number;
}

export type TransactionSyncFailureClassification =
  | 'auth_reconnect'
  | 'internal_provider_system';

export interface ClassifiedTransactionSyncFailure {
  classification: TransactionSyncFailureClassification;
  code: string;
  message: string;
  displayMessage: string;
  retryable: boolean;
}
