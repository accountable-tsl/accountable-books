import { logger } from '../../../shared/utils/logger.js';
import {
  BANK_ACCOUNT_SYNC_BUFFER_WARNING_BYTES,
  BANK_ACCOUNT_SYNC_BUFFER_WARNING_TRANSACTIONS,
} from '../transaction-sync.constants.js';

import type { ProviderTransaction } from '../types/base.js';

/**
 * Shared plumbing for provider adapters that buffer a complete transaction
 * update page by page. The adapters own the pagination; this only enforces
 * account scoping and observability thresholds identically across providers.
 */
export class TransactionUpdateBuffer {
  private observedByProviderId = new Map<string, ProviderTransaction>();
  private removedIds = new Set<string>();
  private bufferWarningLogged = false;
  pageCount = 0;
  approximatePayloadBytes = 0;

  constructor(
    private readonly context: {
      providerKey: string;
      providerBankAccountId: string;
    },
  ) {}

  addPage(page: {
    observedTransactions: ProviderTransaction[];
    removedTransactionIds: string[];
  }): void {
    assertAccountScoped(
      page.observedTransactions,
      this.context.providerBankAccountId,
    );
    // A later observation of the same provider id within one update wins.
    for (const transaction of page.observedTransactions) {
      this.observedByProviderId.set(transaction.transactionId, transaction);
    }
    for (const removedId of page.removedTransactionIds) {
      this.removedIds.add(removedId);
    }
    this.pageCount += 1;
    this.approximatePayloadBytes += approximatePayloadBytes(page);

    const transactionCount =
      this.observedByProviderId.size + this.removedIds.size;
    if (
      !this.bufferWarningLogged &&
      (transactionCount >= BANK_ACCOUNT_SYNC_BUFFER_WARNING_TRANSACTIONS ||
        this.approximatePayloadBytes >= BANK_ACCOUNT_SYNC_BUFFER_WARNING_BYTES)
    ) {
      this.bufferWarningLogged = true;
      logger.warn(
        {
          providerKey: this.context.providerKey,
          providerBankAccountId: this.context.providerBankAccountId,
          pageCount: this.pageCount,
          transactionCount,
          approximatePayloadBytes: this.approximatePayloadBytes,
        },
        'Transaction sync buffer exceeded an observability threshold',
      );
    }
  }

  get observedTransactions(): ProviderTransaction[] {
    return [...this.observedByProviderId.values()];
  }

  get removedTransactionIds(): string[] {
    return [...this.removedIds];
  }
}

export function assertAccountScoped(
  transactions: ProviderTransaction[],
  providerBankAccountId: string,
): void {
  const mismatched = transactions.find(
    (transaction) =>
      transaction.providerBankAccountId !== providerBankAccountId,
  );
  if (mismatched) {
    throw new Error(
      `Provider returned transaction ${mismatched.transactionId} for account ${mismatched.providerBankAccountId} while syncing ${providerBankAccountId}`,
    );
  }
}

function approximatePayloadBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return 0;
  }
}
