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
import { buildScopeKey } from '../../work/work.types.js';
import {
  claimNextPendingIntent,
  dispatchPendingIntents,
  getOutboxHealthSnapshot,
  laneFilter,
  OUTBOX_INTENT,
  OUTBOX_LANE,
  OUTBOX_MAX_DISPATCH_ATTEMPTS,
  recordIntentFailure,
  writeOutbox,
} from '../index.js';

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
      bank_id: existing.bank_id,
      currency_id: company.reporting_currency_id,
      company_id: companyId,
      coa_id: existing.coa_id,
      created_by_id: userId,
    })
    .returning('id');

  return account.id;
}

describe('outbox', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queueBroker.configure({ disableAll: true, logSkipped: false });
  });

  it('debounces pending intents for the same (intent_type, scope_key) onto one row', async () => {
    const trx = await getTestDb().transaction();
    try {
      const scopeKey = `bank_account:${randomUUID()}:${randomUUID()}`;

      await writeOutbox(trx, {
        intentType: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
        scopeKey,
        payload: { attempt: 1 },
      });
      await writeOutbox(trx, {
        intentType: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
        scopeKey,
        payload: { attempt: 2 },
      });

      const pending = await trx('app.outbox').where({
        intent_type: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
        scope_key: scopeKey,
        status: 'pending',
      });

      expect(pending).toHaveLength(1);
      expect(pending[0].payload).toEqual({ attempt: 2 });
    } finally {
      await trx.rollback();
    }
  });

  it('reports deadLettered only once dispatch attempts are exhausted', async () => {
    const exhaustedScope = `deadletter_test:${randomUUID()}`;
    const retryScope = `retry_test:${randomUUID()}`;
    try {
      const [exhausted] = await knexClient('app.outbox')
        .insert({
          intent_type: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
          scope_key: exhaustedScope,
          dispatch_attempt_count: OUTBOX_MAX_DISPATCH_ATTEMPTS - 1,
        })
        .returning('id');
      const [retryable] = await knexClient('app.outbox')
        .insert({
          intent_type: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
          scope_key: retryScope,
          dispatch_attempt_count: 0,
        })
        .returning('id');

      const exhaustedResult = await recordIntentFailure(
        exhausted.id,
        new Error('boom'),
      );
      expect(exhaustedResult.deadLettered).toBe(true);
      const exhaustedRow = await knexClient('app.outbox')
        .where({ id: exhausted.id })
        .first('status');
      expect(exhaustedRow?.status).toBe('failed');

      const retryResult = await recordIntentFailure(
        retryable.id,
        new Error('boom'),
      );
      expect(retryResult.deadLettered).toBe(false);
      const retryRow = await knexClient('app.outbox')
        .where({ id: retryable.id })
        .first('status');
      expect(retryRow?.status).toBe('pending');
    } finally {
      await knexClient('app.outbox')
        .whereIn('scope_key', [exhaustedScope, retryScope])
        .del();
    }
  });

  it('health snapshot counts failed and overdue pending rows', async () => {
    const failedScope = `health_failed:${randomUUID()}`;
    const pendingScope = `health_pending:${randomUUID()}`;
    try {
      await knexClient('app.outbox').insert([
        {
          intent_type: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
          scope_key: failedScope,
          status: 'failed',
          completed_at: knexClient.fn.now(),
          failed_at: knexClient.fn.now(),
          dispatch_attempt_count: OUTBOX_MAX_DISPATCH_ATTEMPTS,
        },
        {
          intent_type: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
          scope_key: pendingScope,
          status: 'pending',
          available_at: knexClient.raw(`now() - interval '120 seconds'`),
        },
      ]);

      const snapshot = await getOutboxHealthSnapshot();
      expect(snapshot.failedCount).toBeGreaterThanOrEqual(1);
      expect(snapshot.pendingCount).toBeGreaterThanOrEqual(1);
      expect(snapshot.oldestPendingAgeSeconds ?? 0).toBeGreaterThanOrEqual(100);
    } finally {
      await knexClient('app.outbox')
        .whereIn('scope_key', [failedScope, pendingScope])
        .del();
    }
  });

  it('lane filters keep heavy and fast intents on separate runners', async () => {
    const trx = await getTestDb().transaction();
    try {
      const heavyScope = `gl:${randomUUID()}`;
      const fastScope = `notif:${randomUUID()}`;
      await writeOutbox(trx, {
        intentType: OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED,
        scopeKey: heavyScope,
        payload: {},
      });
      await writeOutbox(trx, {
        intentType: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
        scopeKey: fastScope,
        payload: {},
      });

      // Heavy lane claims the heavy intent, never the fast one.
      expect(
        await claimNextPendingIntent(trx, {
          ...laneFilter(OUTBOX_LANE.HEAVY),
          scopeKey: heavyScope,
        }),
      ).not.toBeNull();
      expect(
        await claimNextPendingIntent(trx, {
          ...laneFilter(OUTBOX_LANE.HEAVY),
          scopeKey: fastScope,
        }),
      ).toBeNull();

      // Fast lane claims the fast intent, never the heavy one.
      expect(
        await claimNextPendingIntent(trx, {
          ...laneFilter(OUTBOX_LANE.FAST),
          scopeKey: fastScope,
        }),
      ).not.toBeNull();
      expect(
        await claimNextPendingIntent(trx, {
          ...laneFilter(OUTBOX_LANE.FAST),
          scopeKey: heavyScope,
        }),
      ).toBeNull();
    } finally {
      await trx.rollback();
    }
  });

  it('does not mark unsupported materializer scopes processed successfully', async () => {
    const scope = { type: 'company' as const, clientCompanyId: randomUUID() };
    const scopeKey = buildScopeKey(scope);

    try {
      await knexClient.transaction(async (trx) => {
        await writeOutbox(trx, {
          intentType: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
          scopeKey,
          payload: { scope, change: { type: 'unsupported_scope_test' } },
        });
      });

      const result = await dispatchPendingIntents(1, { scopeKey });
      expect(result).toEqual({ processed: 0, deferred: 0, failed: 1 });

      const row = await knexClient('app.outbox')
        .where({ scope_key: scopeKey })
        .first(
          'status',
          'completed_at',
          'dispatch_attempt_count',
          'last_error',
        );
      expect(row?.status).toBe('pending');
      expect(row?.completed_at).toBeNull();
      expect(Number(row?.dispatch_attempt_count)).toBe(1);
      expect(row?.last_error).toContain(
        'Unsupported materializer scope type: company',
      );
    } finally {
      await knexClient('app.outbox').where({ scope_key: scopeKey }).del();
    }
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

      const pendingInTrx = await trx('app.outbox').where({
        intent_type: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
        scope_key: scopeKey,
        status: 'pending',
      });
      expect(pendingInTrx).toHaveLength(1);
      const payload = pendingInTrx[0].payload as {
        change?: { bankTransactionIds?: string[] };
      };
      expect(payload.change?.bankTransactionIds).toHaveLength(3);

      const activityPendingInTrx = await trx('app.outbox').where({
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

    const committed = await knexClient('app.outbox').where({
      scope_key: scopeKey,
    });
    expect(committed).toHaveLength(0);

    const committedActivity = await knexClient('app.outbox').where({
      scope_key: activityScopeKey,
    });
    expect(committedActivity).toHaveLength(0);
  });
});
