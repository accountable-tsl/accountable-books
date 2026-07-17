import type { Knex } from 'knex';
import { z } from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { OUTBOX_INTENT } from '../../domains/outbox/intents.js';
import {
  deferLeasedIntent,
  markLeasedIntentProcessed,
  OUTBOX_LEASE_RENEW_INTERVAL_MS,
  recordLeasedIntentFailure,
  renewLeasedIntent,
  writeOutbox,
} from '../../domains/outbox/outbox.model.js';
import { getLogger } from '../../shared/utils/logger.js';
import {
  syncErrorMessage,
  TransactionSyncLockBusyError,
} from './services/transaction-sync.errors.js';
import { transactionSyncService } from './services/transaction-sync.service.js';

import type { LeasedOutboxClaim } from '../../domains/outbox/outbox.model.js';
import type { TransactionSyncTrigger } from './services/transaction-sync.service.js';

type IntentOutcome = 'processed' | 'deferred' | 'failed';

const logger = getLogger({ component: 'transaction-sync-outbox' });

export const bankSyncPayloadSchema = z.object({
  bankAccountId: z.uuid(),
  trigger: z.enum(['initial', 'manual', 'periodic', 'webhook']),
  actorUserId: z.uuid().optional(),
});

export type BankSyncPayload = z.infer<typeof bankSyncPayloadSchema>;

export function bankSyncScopeKey(bankAccountId: string): string {
  return `bank_account:${bankAccountId}`;
}

/**
 * Durable sync request. Coalesces on (intent, scope) while pending; keeps an
 * in-flight `initial` trigger so history collection is not demoted mid-run.
 */
export async function writeBankSyncOutbox(
  trx: Knex.Transaction,
  input: {
    bankAccountId: string;
    trigger: TransactionSyncTrigger;
    actorUserId?: string;
  },
): Promise<{ id: string }> {
  const existing = await trx('app.outbox')
    .where({
      intent_type: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
      scope_key: bankSyncScopeKey(input.bankAccountId),
      status: 'pending',
    })
    .first<{ payload: { trigger?: string } }>('payload');

  const trigger =
    existing?.payload?.trigger === 'initial' ? 'initial' : input.trigger;

  const payload = bankSyncPayloadSchema.parse({
    bankAccountId: input.bankAccountId,
    trigger,
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
  });

  return writeOutbox(trx, {
    intentType: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
    scopeKey: bankSyncScopeKey(input.bankAccountId),
    payload,
  });
}

/** Outside a domain transaction: write intent and rely on outbox drain nudge. */
export async function requestBankAccountSync(input: {
  bankAccountId: string;
  trigger: TransactionSyncTrigger;
  actorUserId?: string;
}): Promise<{ id: string }> {
  return knexClient.transaction(async (trx) => writeBankSyncOutbox(trx, input));
}

export async function requestBankSyncForConnection(input: {
  connectionId: string;
  trigger: TransactionSyncTrigger;
  actorUserId?: string;
}): Promise<number> {
  const feeds = await knexClient('bank_account_feeds')
    .where({ bank_connection_id: input.connectionId })
    .whereNull('revoked_at')
    .select<{ bank_account_id: string }[]>('bank_account_id');

  if (feeds.length === 0) return 0;

  await knexClient.transaction(async (trx) => {
    for (const feed of feeds) {
      await writeBankSyncOutbox(trx, {
        bankAccountId: feed.bank_account_id,
        trigger: input.trigger,
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      });
    }
  });

  return feeds.length;
}

/** Completes unleased pending sync intents so revoke/stop cannot leave zombies. */
export async function cancelPendingBankSync({
  bankAccountId,
  trx,
}: {
  bankAccountId: string;
  trx: Knex.Transaction;
}): Promise<number> {
  return trx('app.outbox')
    .where({
      intent_type: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
      scope_key: bankSyncScopeKey(bankAccountId),
      status: 'pending',
    })
    .whereNull('lease_token')
    .update({
      status: 'processed',
      completed_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
}

/**
 * Executes a leased bank-sync outbox intent outside any outbox transaction.
 * The dispatcher calls this after claimLeasedIntent commits.
 */
export async function executeLeasedBankSync(
  leased: LeasedOutboxClaim,
): Promise<IntentOutcome> {
  const payload = bankSyncPayloadSchema.parse(leased.row.payload);
  const renewTimer = setInterval(() => {
    renewLeasedIntent(leased.row.id, leased.leaseToken)
      .then((renewed) => {
        if (!renewed) clearInterval(renewTimer);
      })
      .catch((error: unknown) => {
        // A transient renewal failure is survivable while the lease lasts;
        // the next tick retries.
        logger.warn(
          { outboxId: leased.row.id, error: syncErrorMessage(error) },
          'Failed to renew bank sync outbox lease',
        );
      });
  }, OUTBOX_LEASE_RENEW_INTERVAL_MS);

  try {
    const result = await transactionSyncService.syncBankAccount({
      bankAccountId: payload.bankAccountId,
      trigger: payload.trigger,
      ...(payload.actorUserId ? { actorUserId: payload.actorUserId } : {}),
    });

    // Unsupported is terminal for this intent (revoked feed, inactive
    // connection, provider without sync). A reconnect writes a fresh intent;
    // deferring here would spin forever.
    if (result.outcome === 'unsupported') {
      logger.info(
        { outboxId: leased.row.id, bankAccountId: payload.bankAccountId },
        'Bank sync intent completed as unsupported',
      );
      const processedUnsupported = await markLeasedIntentProcessed(
        leased.row.id,
        leased.leaseToken,
      );
      return processedUnsupported ? 'processed' : 'failed';
    }

    if (
      result.outcome === 'not_ready' ||
      result.historyStatus === 'collecting'
    ) {
      const deferred = await deferLeasedIntent(
        leased.row.id,
        leased.leaseToken,
        result.outcome === 'not_ready' ? 120 : 60,
      );
      return deferred ? 'deferred' : 'failed';
    }

    const processed = await markLeasedIntentProcessed(
      leased.row.id,
      leased.leaseToken,
    );
    return processed ? 'processed' : 'failed';
  } catch (error) {
    if (error instanceof TransactionSyncLockBusyError) {
      const deferred = await deferLeasedIntent(
        leased.row.id,
        leased.leaseToken,
        30,
      );
      return deferred ? 'deferred' : 'failed';
    }

    logger.error(
      {
        outboxId: leased.row.id,
        bankAccountId: payload.bankAccountId,
        trigger: payload.trigger,
        error: syncErrorMessage(error),
      },
      'Bank sync outbox handler failed',
    );

    const { deadLettered, ownershipLost } = await recordLeasedIntentFailure(
      leased.row.id,
      leased.leaseToken,
      error,
    );
    if (ownershipLost) return 'failed';
    return deadLettered ? 'failed' : 'deferred';
  } finally {
    clearInterval(renewTimer);
  }
}
