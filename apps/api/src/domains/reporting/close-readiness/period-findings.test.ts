import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { getAccountActivity } from './account-activity.js';
import { recordCloseReviewDecision } from './close-decisions.js';
import { evaluatePeriodFindings } from './period-findings.js';
import {
  createCoa,
  createFixture,
  insertLedgerTransaction,
  insertMonthlyPeriod,
  type Fixture,
} from './signals/signal-fixtures.js';

const PERIOD = {
  fiscalYear: 2026,
  periodNumber: 6,
  periodType: 'monthly' as const,
};
const START = '2026-06-01';
const END = '2026-06-30';

const CAPEX_FINDING = 'fixed_asset_depreciation_review';
const FX_FINDING = 'fx_revaluation_decision_review';

describe('evaluatePeriodFindings', () => {
  let trx: Knex.Transaction;
  let fixture: Fixture;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    fixture = await createFixture(trx); // modified_accrual_basis by default
    await insertMonthlyPeriod(trx, fixture, {
      ...PERIOD,
      startDate: START,
      endDate: END,
    });
  });

  afterEach(async () => {
    await trx.rollback();
  });

  async function run(
    accountingBasis: 'modified_accrual_basis' | 'modified_cash_basis' = 'modified_accrual_basis',
  ) {
    const accountActivity = await getAccountActivity({
      queryable: trx,
      companyId: fixture.companyId,
      startDate: START,
      endDate: END,
    });
    return evaluatePeriodFindings({
      queryable: trx,
      accountingBasis,
      period: { companyId: fixture.companyId, ...PERIOD },
      startDate: START,
      endDate: END,
      accountActivity,
    });
  }

  async function buyFixedAsset(): Promise<void> {
    await insertLedgerTransaction(
      trx,
      fixture,
      { transactionSource: 'bank_transaction' },
      [
        { accountTypeKey: 'ca_bank', amount: -1000, isBankLeg: true },
        { accountTypeKey: 'nca_ppe', amount: 1000 },
      ],
    );
  }

  it('flags capex without a depreciation movement', async () => {
    await buyFixedAsset();

    const codes = (await run()).map((finding) => finding.code);
    expect(codes).toContain(CAPEX_FINDING);
  });

  it('does not flag capex when depreciation moved in the period', async () => {
    await buyFixedAsset();
    await insertLedgerTransaction(
      trx,
      fixture,
      { transactionSource: 'manual_journal' },
      [
        { accountTypeKey: 'exp_opex_depreciation_amortization', amount: 50 },
        { accountTypeKey: 'nca_ppe_contra', amount: -50 },
      ],
    );

    const codes = (await run()).map((finding) => finding.code);
    expect(codes).not.toContain(CAPEX_FINDING);
  });

  it('does not run for modified-cash companies', async () => {
    await buyFixedAsset();
    expect(await run('modified_cash_basis')).toHaveLength(0);
  });

  it('flags open FX positions without a revaluation, and clears once revalued', async () => {
    const positionId = await insertOpenFxPosition(trx, fixture, 1000);

    expect((await run()).map((f) => f.code)).toContain(FX_FINDING);

    await insertPeriodRevaluation(trx, fixture, positionId);
    expect((await run()).map((f) => f.code)).not.toContain(FX_FINDING);
  });

  it('is acknowledgeable and re-opens when the facts change', async () => {
    await buyFixedAsset();

    const finding = (await run()).find((f) => f.code === CAPEX_FINDING)!;
    expect(finding.acknowledgement?.scope).toBe('period_finding');

    const result = await recordCloseReviewDecision({
      companyId: fixture.companyId,
      ...PERIOD,
      findingCode: CAPEX_FINDING,
      decision: 'acknowledged',
      reason: 'Depreciation maintained in an external fixed-asset register.',
      decidedById: fixture.userId,
      expectedFactsHash: finding.acknowledgement!.factsHash,
      trx,
    });
    expect(result.ok).toBe(true);

    // Acknowledged → suppressed.
    expect((await run()).map((f) => f.code)).not.toContain(CAPEX_FINDING);

    // Another fixed-asset account moving changes the related set → new identity,
    // so the prior acknowledgement no longer applies and the finding re-opens.
    // (Bought on credit, so it reuses no account already created by buyFixedAsset.)
    await insertLedgerTransaction(
      trx,
      fixture,
      { transactionSource: 'manual_journal' },
      [
        { accountTypeKey: 'nca_intangible_asset', amount: 500 },
        { accountTypeKey: 'cl_trade_payable', amount: -500 },
      ],
    );
    expect((await run()).map((f) => f.code)).toContain(CAPEX_FINDING);
  });
});

/** Insert an open FX position for a fresh COA; returns the position id. */
async function insertOpenFxPosition(
  trx: Knex.Transaction,
  fixture: Fixture,
  openAmount: number,
): Promise<string> {
  const accountId = await createCoa(trx, fixture, 'ca_bank');
  const [position] = await trx('fx_positions')
    .insert({
      company_id: fixture.companyId,
      fx_transaction_id: `fx-${randomUUID()}`,
      account_id: accountId,
      foreign_currency_id: fixture.currencyId,
      open_fx_amount: openAmount,
      carrying_rate: 1,
      carrying_base_amount: openAmount,
      state: 'open',
    })
    .returning<{ id: string }[]>('id');
  if (!position) throw new Error('Failed to create fx position');
  return position.id;
}

async function insertPeriodRevaluation(
  trx: Knex.Transaction,
  fixture: Fixture,
  fxPositionId: string,
): Promise<void> {
  await trx('fx_position_movements').insert({
    company_id: fixture.companyId,
    fx_position_id: fxPositionId,
    source_type: 'period_revaluation',
    movement_type: 'revalued',
    movement_date: '2026-06-30',
    foreign_amount_delta: 0,
    base_amount_delta: 25,
    rate: 1.025,
    open_fx_amount_before: 1000,
    open_fx_amount_after: 1000,
    carrying_base_amount_before: 1000,
    carrying_base_amount_after: 1025,
    created_by_id: fixture.userId,
  });
}
