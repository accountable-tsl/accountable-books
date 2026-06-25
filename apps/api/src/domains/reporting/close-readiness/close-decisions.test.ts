import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  ACTIVITY_EVENT_TYPE,
  buildActivityEventScopeKey,
} from '../../activity/index.js';
import { OUTBOX_INTENT } from '../../work/work.types.js';
import { recordCloseReviewDecision } from './close-decisions.js';
import {
  computeOpenSignalRollups,
  mergeOpenSignalFindings,
} from './open-signal-findings.js';
import { syncLedgerTransactionSignals } from './signals/close-signals.sync.js';
import {
  createFixture,
  insertLedgerTransaction,
  insertMonthlyPeriod,
} from './signals/signal-fixtures.js';

import type { Fixture } from './signals/signal-fixtures.js';

const PERIOD = {
  fiscalYear: 2026,
  periodNumber: 6,
  periodType: 'monthly' as const,
};
const REVENUE_FINDING = 'bank_receipt_direct_to_revenue_review' as const;

describe('recordCloseReviewDecision', () => {
  let trx: Knex.Transaction;
  let fixture: Fixture;
  let periodKey: {
    companyId: string;
    fiscalCalendarId: string;
    fiscalYear: number;
    periodNumber: number;
    periodType: 'monthly';
  };

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    fixture = await createFixture(trx);
    const fiscalCalendarId = await insertMonthlyPeriod(trx, fixture, {
      ...PERIOD,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    periodKey = {
      companyId: fixture.companyId,
      fiscalCalendarId,
      ...PERIOD,
    };
  });

  afterEach(async () => {
    await trx.rollback();
  });

  /** A bank receipt offset straight to revenue → one surfaced signal. */
  async function seedRevenueSignal(): Promise<void> {
    const ledgerTransactionId = await insertLedgerTransaction(
      trx,
      fixture,
      { transactionSource: 'bank_transaction' },
      [
        { accountTypeKey: 'ca_bank', amount: 100, isBankLeg: true },
        { accountTypeKey: 'rev_revenue', amount: -100 },
      ],
    );
    await syncLedgerTransactionSignals(ledgerTransactionId, trx);
  }

  function merge() {
    return mergeOpenSignalFindings({
      queryable: trx,
      period: periodKey,
    });
  }

  it('surfaces the rollup finding with an acknowledgement identity', async () => {
    await seedRevenueSignal();

    const findings = await merge();
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe(REVENUE_FINDING);
    expect(finding.acknowledgement?.scope).toBe('period_finding');
    expect(finding.acknowledgement?.fingerprint).toBeTruthy();
    expect(finding.acknowledgement?.factsHash).toBeTruthy();
  });

  it('suppresses the finding after a matching decision, and re-opens it when the facts change', async () => {
    await seedRevenueSignal();
    const before = await merge();
    const ack = before[0]!.acknowledgement!;

    const result = await recordCloseReviewDecision({
      companyId: fixture.companyId,
      ...PERIOD,
      findingCode: REVENUE_FINDING,
      decision: 'acknowledged',
      reason: 'Sole trader with no receivables; direct-to-revenue is correct.',
      decidedById: fixture.userId,
      expectedFactsHash: ack.factsHash,
      trx,
    });
    expect(result.ok).toBe(true);

    if (!result.ok) throw new Error('Expected close decision to be recorded');
    const activity = await trx('app.outbox_intents')
      .where({
        intent_type: OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED,
        scope_key: buildActivityEventScopeKey(
          `activity:${ACTIVITY_EVENT_TYPE.CLOSE_DECISION_RECORDED}:${result.decision.id}`,
        ),
      })
      .first('payload');
    expect(activity?.payload.event).toMatchObject({
      eventType: ACTIVITY_EVENT_TYPE.CLOSE_DECISION_RECORDED,
      sourceEntity: {
        type: 'close_review_decision',
        id: result.decision.id,
      },
      actor: { type: 'user', userId: fixture.userId },
      fiscalCalendarId: periodKey.fiscalCalendarId,
      metadata: {
        findingCode: REVENUE_FINDING,
        decision: 'acknowledged',
      },
    });

    // Acknowledged with matching facts → no longer open.
    expect(await merge()).toHaveLength(0);

    // A change to the underlying signal flips the rollup facts_hash, so the old
    // decision no longer matches and the finding re-opens.
    await trx('close_review_signals')
      .where({ company_id: fixture.companyId })
      .update({ facts_hash: 'changed-fact' });

    const reopened = await merge();
    expect(reopened).toHaveLength(1);
    expect(reopened[0]!.code).toBe(REVENUE_FINDING);
  });

  it('rejects a decision whose expected facts_hash is stale', async () => {
    await seedRevenueSignal();

    const result = await recordCloseReviewDecision({
      companyId: fixture.companyId,
      ...PERIOD,
      findingCode: REVENUE_FINDING,
      decision: 'acknowledged',
      reason: 'stale view',
      decidedById: fixture.userId,
      expectedFactsHash: 'no-longer-current',
      trx,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('facts_changed');
  });

  it('returns no_open_finding when the period has no such finding', async () => {
    const rollups = await computeOpenSignalRollups({
      queryable: trx,
      ...periodKey,
    });
    expect(rollups).toHaveLength(0);

    const result = await recordCloseReviewDecision({
      companyId: fixture.companyId,
      ...PERIOD,
      findingCode: REVENUE_FINDING,
      decision: 'dismissed',
      reason: 'nothing here',
      decidedById: fixture.userId,
      trx,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_open_finding');
  });
});
