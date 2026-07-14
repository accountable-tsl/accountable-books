import type { BankAccountCredential } from '../../../domains/banking/bankAccountCredentials/bankAccountCredentials.types.js';
import type { BankAccountConnectionStatus } from '../../../domains/banking/bankAccounts/bankAccounts.types.js';
import type { ProviderTransaction } from '../types/base.js';

export type TransactionSyncTrigger =
  | 'initial'
  | 'periodic'
  | 'manual'
  | 'webhook';

export interface TransactionSyncCommand {
  bankAccountId: string;
  trigger: TransactionSyncTrigger;
  actorUserId?: string;
}

export interface BankAccountSyncResult {
  bankAccountId: string;
  outcome: 'completed' | 'not_ready' | 'unsupported';
  initialSync: boolean;
  added: number;
  modified: number;
  removed: number;
}

export interface BankAccountForSync {
  id: string;
  provider_bank_account_id: string | null;
  connection_credential_id: string | null;
  connection_status: BankAccountConnectionStatus;
  company_id: string;
  transaction_sync_cursor: string | null;
  initial_transaction_sync_completed_at: Date | null;
  last_sync_at: Date | null;
  is_deleted: boolean;
}

export type DecryptedBankAccountCredential = BankAccountCredential & {
  access_token: string;
};

export interface CompleteTransactionUpdate {
  added: ProviderTransaction[];
  modified: ProviderTransaction[];
  removed: string[];
  finalCursor?: string;
  pageCount: number;
  approximatePayloadBytes: number;
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
