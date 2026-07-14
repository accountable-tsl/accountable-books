import { startOfMonth } from 'date-fns';

import { logger } from '../../../shared/utils/logger.js';
import {
  BANK_ACCOUNT_SYNC_BUFFER_WARNING_BYTES,
  BANK_ACCOUNT_SYNC_BUFFER_WARNING_TRANSACTIONS,
} from '../transaction-sync.constants.js';
import { isProviderError } from './transaction-sync.errors.js';

import type { BankAccountCredential } from '../../../domains/banking/bankAccountCredentials/bankAccountCredentials.types.js';
import type { BankingProvider, ProviderTransaction } from '../types/base.js';
import type {
  BankAccountForSync,
  CompleteTransactionUpdate,
} from './transaction-sync.types.js';

const PLAID_PAGINATION_MUTATION =
  'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION';
const MAX_PAGINATION_ATTEMPTS = 3;

interface FetchCompleteTransactionUpdateInput {
  provider: BankingProvider;
  accessToken: string;
  providerBankAccountId: string;
  startingCursor?: string;
  fromDate?: Date;
  usesDateRangeStrategy: boolean;
}

export function getTransactionSyncFromDate(input: {
  initialSync: boolean;
  usesDateRangeStrategy: boolean;
  credential: BankAccountCredential;
  account: BankAccountForSync;
}): Date | undefined {
  if (!input.usesDateRangeStrategy) return undefined;
  if (input.initialSync) {
    return input.credential.transactions_from_date
      ? new Date(input.credential.transactions_from_date)
      : startOfMonth(new Date());
  }
  if (!input.account.last_sync_at) return startOfMonth(new Date());
  const fromDate = new Date(input.account.last_sync_at);
  fromDate.setDate(fromDate.getDate() - 1);
  return fromDate;
}

export async function fetchCompleteTransactionUpdate(
  input: FetchCompleteTransactionUpdateInput,
): Promise<CompleteTransactionUpdate> {
  const attempts = input.usesDateRangeStrategy ? 1 : MAX_PAGINATION_ATTEMPTS;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetchAllPages(input);
    } catch (error) {
      const isMutation =
        isProviderError(error) && error.code === PLAID_PAGINATION_MUTATION;
      if (!isMutation || attempt === attempts) throw error;
      logger.warn(
        {
          providerKey: input.provider.key,
          providerBankAccountId: input.providerBankAccountId,
          attempt,
        },
        'Transaction stream changed during pagination; restarting from original cursor',
      );
    }
  }
  throw new Error('Transaction pagination attempts exhausted');
}

async function fetchAllPages(
  input: FetchCompleteTransactionUpdateInput,
): Promise<CompleteTransactionUpdate> {
  const update: CompleteTransactionUpdate = {
    added: [],
    modified: [],
    removed: [],
    pageCount: 0,
    approximatePayloadBytes: 0,
  };
  let cursor = input.startingCursor;
  let bufferWarningLogged = false;

  while (true) {
    const page = await input.provider.syncTransactions({
      accessToken: input.accessToken,
      providerBankAccountId: input.providerBankAccountId,
      cursor,
      fromDate: input.fromDate,
    });
    assertAccountScoped(
      [...page.transactions.added, ...page.transactions.modified],
      input.providerBankAccountId,
    );
    update.added.push(...page.transactions.added);
    update.modified.push(...page.transactions.modified);
    update.removed.push(...page.transactions.removed);
    update.pageCount += 1;
    update.approximatePayloadBytes += approximatePayloadBytes(
      page.transactions,
    );

    const transactionCount =
      update.added.length + update.modified.length + update.removed.length;
    if (
      !bufferWarningLogged &&
      (transactionCount >= BANK_ACCOUNT_SYNC_BUFFER_WARNING_TRANSACTIONS ||
        update.approximatePayloadBytes >=
          BANK_ACCOUNT_SYNC_BUFFER_WARNING_BYTES)
    ) {
      bufferWarningLogged = true;
      logger.warn(
        {
          providerKey: input.provider.key,
          providerBankAccountId: input.providerBankAccountId,
          pageCount: update.pageCount,
          transactionCount,
          approximatePayloadBytes: update.approximatePayloadBytes,
        },
        'Transaction sync buffer exceeded an observability threshold',
      );
    }

    if (!page.hasMore) {
      update.finalCursor = input.usesDateRangeStrategy
        ? undefined
        : page.nextCursor;
      return update;
    }
    if (!page.nextCursor) {
      throw new Error(
        'Provider reported more transaction pages without a cursor',
      );
    }
    cursor = page.nextCursor;
  }
}

function approximatePayloadBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return 0;
  }
}

function assertAccountScoped(
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
