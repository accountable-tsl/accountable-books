import type { ProviderError } from '../types/base.js';

export class TransactionSyncLockBusyError extends Error {
  constructor(bankAccountId: string) {
    super(`Transaction sync already in progress for account ${bankAccountId}`);
    this.name = 'TransactionSyncLockBusyError';
  }
}

export class StaleBankAccountSyncError extends Error {
  constructor(bankAccountId: string) {
    super(
      `Bank account sync state changed while account ${bankAccountId} was being fetched`,
    );
    this.name = 'StaleBankAccountSyncError';
  }
}

export class AccountTransactionApplyError extends Error {
  constructor(
    message: string,
    readonly failedTransactionCount?: number,
  ) {
    super(message);
    this.name = 'AccountTransactionApplyError';
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Partial<ProviderError>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.displayMessage === 'string' &&
    typeof candidate.retryable === 'boolean'
  );
}

export function syncErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isProviderError(error)) {
    return error.message || error.displayMessage || error.code;
  }
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export function isRetryableTransactionSyncFailure(error: unknown): boolean {
  if (
    error instanceof TransactionSyncLockBusyError ||
    error instanceof StaleBankAccountSyncError
  ) {
    return true;
  }
  if (error instanceof AccountTransactionApplyError) return false;
  if (isProviderError(error)) return error.retryable;
  return true;
}
