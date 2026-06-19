import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { knexClient } from '../../../db/knexClient.js';
import { queueBroker } from '../../../jobs/queues/queue-broker.js';
import { ACTIVITY_EVENT_TYPE } from '../../activity/index.js';
import { addNewBankTransactions } from '../../bankTransactions/bankTransactions.model.js';
import { dispatchPendingIntents } from '../outbox.dispatcher.js';
import { writeOutboxIntent } from '../outbox.model.js';
import {
  outboxDispatchQueue,
  scheduleOutboxDispatchKickAfterCommit,
} from '../outbox.queue.js';
import { buildScopeKey, OUTBOX_INTENT } from '../work.types.js';

async function createFreshBankAccount(
  trx: Knex.Transaction,
  companyId: string,
  userId: string,
): Promise<string> {
  const existing = await trx('bank_accounts')
    .where({ company_id: companyId, is_deleted: false })
    .first('bank_id', 'coa_id');
  if (!existing) {
    throw new Error('Demo company has no bank account to template from');
  }
  const company = await trx('companies')
    .where({ id: companyId })
    .first('reporting_currency_id');

  const [account] = await trx('bank_accounts')
    .insert({
      display_name: 'WorkQueue Test Account',
      account_number: `WQ-${randomUUID()}`,
      bank_id: existing.bank_id,
      currency_id: company.reporting_currency_id,
      company_id: companyId,
      coa_id: existing.coa_id,
      connection_status: 'not_connected',
      created_by_id: userId,
    })
    .returning('id');

  return account.id;
}

describe('work outbox', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queueBroker.configure({ disableAll: true, logSkipped: false });
  });

  it('debounces pending intents for the same (intent_type, scope_key) onto one row', async () => {
    const trx = await getTestDb().transaction();
    try {
      const scopeKey = `bank_account:${randomUUID()}:${randomUUID()}`;

      await writeOutboxIntent(trx, {
        intentType: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
        scopeKey,
        payload: { attempt: 1 },
      });
      await writeOutboxIntent(trx, {
        intentType: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
        scopeKey,
        payload: { attempt: 2 },
      });

      const pending = await trx('app.outbox_intents')
        .where({
          intent_type: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
          scope_key: scopeKey,
          status: 'pending',
        })

      expect(pending).toHaveLength(1);
      // Latest payload wins on the debounced row.
      expect(pending[0].payload).toEqual({ attempt: 2 });
    } finally {
      await trx.rollback();
    }
  });

  it('does not mark unsupported materializer scopes processed successfully', async () => {
    const scope = { type: 'company' as const, clientCompanyId: randomUUID() };
    const scopeKey = buildScopeKey(scope);

    try {
      await knexClient.transaction(async (trx) => {
        await writeOutboxIntent(trx, {
          intentType: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
          scopeKey,
          payload: { scope, change: { type: 'unsupported_scope_test' } },
        });
      });

      const result = await dispatchPendingIntents(1, { scopeKey });
      expect(result).toEqual({ processed: 0, deferred: 0, failed: 1 });

      const row = await knexClient('app.outbox_intents')
        .where({ scope_key: scopeKey })
        .first(
          'status',
          'processed_at',
          'dispatch_attempt_count',
          'last_error',
        );
      expect(row?.status).toBe('pending');
      expect(row?.processed_at).toBeNull();
      expect(Number(row?.dispatch_attempt_count)).toBe(1);
      expect(row?.last_error).toContain(
        'Unsupported materializer scope type: company',
      );
    } finally {
      await knexClient('app.outbox_intents')
        .where({ scope_key: scopeKey })
        .del();
    }
  });

  it('enqueues the outbox dispatch kick only after the transaction commits', async () => {
    queueBroker.configure({ disableAll: false, logSkipped: false });
    const add = vi
      .spyOn(outboxDispatchQueue, 'add')
      .mockResolvedValue({ id: 'kick' } as never);

    const committing = new EventEmitter() as Knex.Transaction;
    await scheduleOutboxDispatchKickAfterCommit(committing);
    expect(add).not.toHaveBeenCalled();

    committing.emit('commit');
    await new Promise((resolve) => setImmediate(resolve));
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'dispatch',
      expect.objectContaining({ trigger: 'kick' }),
    );

    // A rolled-back transaction must never enqueue the kick.
    const rollingBack = new EventEmitter() as Knex.Transaction;
    await scheduleOutboxDispatchKickAfterCommit(rollingBack);
    rollingBack.emit('rollback');
    await new Promise((resolve) => setImmediate(resolve));
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('writes the work-materialization intent inside the import transaction and leaves nothing committed on rollback', async () => {
    const trx = await getTestDb().transaction();
    const companyId = await getTestCompanyId(trx, 'bizDemoUS');
    const userId = await getTestUserId(trx, US_USER_EMAIL);
    const bankAccountId = await createFreshBankAccount(trx, companyId, userId);
    let activityScopeKey = '';
    const scopeKey = buildScopeKey({
      type: 'bank_account',
      clientCompanyId: companyId,
      bankAccountId,
    });

    try {
      const result = await addNewBankTransactions({
        userId,
        companyId,
        trx,
        data: {
          source: 'manual_entry',
          bank_account_id: bankAccountId,
          source_metadata: {},
          bank_transactions: [
            {
              transaction_date: new Date('2025-02-01'),
              amount: -25,
              bank_account_id: bankAccountId,
            },
            {
              transaction_date: new Date('2025-02-02'),
              amount: -50,
              bank_account_id: bankAccountId,
            },
            {
              transaction_date: new Date('2025-02-03'),
              amount: 75,
              bank_account_id: bankAccountId,
            },
          ],
        },
      });
      expect(result.success).toBe(true);
      const batchId = result.data?.batchId;
      expect(batchId).toBeTruthy();

      // The durable hand-off exists inside the same save transaction...
      const pendingInTrx = await trx('app.outbox_intents')
        .where({
          intent_type: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
          scope_key: scopeKey,
          status: 'pending',
        })
      expect(pendingInTrx).toHaveLength(1);
      const payload = pendingInTrx[0].payload as {
        change?: { bankTransactionIds?: string[] };
      };
      expect(payload.change?.bankTransactionIds).toHaveLength(3);

      const activityPendingInTrx = await trx('app.outbox_intents').where({
        intent_type: OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED,
        status: 'pending',
      });
      const importActivityIntent = activityPendingInTrx.find((row) => {
        const payload = row.payload as {
          event?: {
            eventType?: string;
            itemCount?: number;
            sourceEntity?: { id?: string };
          };
        };
        return (
          payload.event?.eventType ===
            ACTIVITY_EVENT_TYPE.BANK_TRANSACTIONS_IMPORTED &&
          payload.event.sourceEntity?.id === batchId
        );
      });
      expect(importActivityIntent).toBeDefined();
      expect(
        (importActivityIntent!.payload as { event: { itemCount: number } })
          .event.itemCount,
      ).toBe(3);
      activityScopeKey = importActivityIntent!.scope_key;
    } finally {
      await trx.rollback();
    }

    // ...and nothing is committed once the import rolls back.
    const committed = await knexClient('app.outbox_intents').where({
      scope_key: scopeKey,
    });
    expect(committed).toHaveLength(0);

    const committedActivity = await knexClient('app.outbox_intents').where({
      scope_key: activityScopeKey,
    });
    expect(committedActivity).toHaveLength(0);
  });
});
