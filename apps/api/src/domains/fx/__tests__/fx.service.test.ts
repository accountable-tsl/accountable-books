import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  createLedgerRecord,
  supersedeLedgerTransaction,
} from '../../ledgers/index.js';
import { setCompanySettings } from '../../settings/settings.service.js';
import { reverseFxPositionMovementsForLedgerTransaction } from '../fx.service.js';

import type { NewLedgerTransactionData } from '../../ledgers/index.js';

type TestFixture = {
  companyId: string;
  userId: string;
  usdCurrencyId: string;
  eurCurrencyId: string;
  bankCoaId: string;
  receivableCoaId: string;
};

describe('FX positions', () => {
  let trx: Knex.Transaction;
  let fixture: TestFixture;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    fixture = await createFixture(trx);
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('does not track positions when track_fx_positions is disabled', async () => {
    const result = await createLedgerRecord({
      data: buildFxLedgerData(fixture, {
        bankAmount: 1000,
        receivableAmount: -1000,
      }),
      companyId: fixture.companyId,
      userId: fixture.userId,
      trx,
    });

    expect(result.success).toBe(true);

    const positions = await trx('fx_positions').where({
      company_id: fixture.companyId,
    });
    expect(positions).toHaveLength(0);
  });

  it('creates separate positions and opening movements per account under one FX transaction', async () => {
    await enableFxTracking(trx, fixture);

    const result = await createLedgerRecord({
      data: buildFxLedgerData(fixture, {
        bankAmount: 1000,
        receivableAmount: -1000,
      }),
      companyId: fixture.companyId,
      userId: fixture.userId,
      trx,
    });

    expect(result.success).toBe(true);

    const positions = await trx('fx_positions')
      .where({ company_id: fixture.companyId })
      .orderBy('account_id');
    expect(positions).toHaveLength(2);
    expect(new Set(positions.map((position) => position.account_id))).toEqual(
      new Set([fixture.bankCoaId, fixture.receivableCoaId]),
    );
    expect(
      new Set(positions.map((position) => position.fx_transaction_id)).size,
    ).toBe(1);

    const movements = await trx('fx_position_movements')
      .where({ company_id: fixture.companyId })
      .orderBy('created_at');
    expect(movements).toHaveLength(2);
    expect(
      movements.every((movement) => movement.movement_type === 'opened'),
    ).toBe(true);
    expect(
      movements.every((movement) => movement.source_type === 'ledger_entry'),
    ).toBe(true);
    expect(
      movements.every(
        (movement) => movement.source_id === movement.ledger_entry_id,
      ),
    ).toBe(true);
    expect(movements.every((movement) => movement.ledger_entry_id)).toBe(true);
  });

  it('writes compensating movements and closes positions for a ledger reversal', async () => {
    await enableFxTracking(trx, fixture);

    const result = await createLedgerRecord({
      data: buildFxLedgerData(fixture, {
        bankAmount: 1000,
        receivableAmount: -1000,
      }),
      companyId: fixture.companyId,
      userId: fixture.userId,
      trx,
    });
    expect(result.success).toBe(true);
    const ledgerTransactionId = result.data!.ledgerTransactionId;

    const reversal = await reverseFxPositionMovementsForLedgerTransaction({
      companyId: fixture.companyId,
      ledgerTransactionId,
      movementDate: '2025-01-16',
      createdById: fixture.userId,
      movementType: 'reversed',
      trx,
    });

    expect(reversal).toEqual({ movementsReversed: 2, positionsClosed: 2 });

    const positions = await trx('fx_positions').where({
      company_id: fixture.companyId,
    });
    expect(positions).toHaveLength(2);
    expect(positions.every((position) => position.state === 'closed')).toBe(
      true,
    );
    expect(
      positions.every((position) => Number(position.open_fx_amount) === 0),
    ).toBe(true);

    const movements = await trx('fx_position_movements').where({
      company_id: fixture.companyId,
    });
    expect(movements).toHaveLength(4);
    expect(
      movements.filter((movement) => movement.movement_type === 'reversed'),
    ).toHaveLength(2);
    expect(
      movements.filter(
        (movement) => movement.source_type === 'ledger_reversal',
      ),
    ).toHaveLength(2);
  });

  it('reverses old FX movements and applies new ones when a ledger transaction is superseded', async () => {
    await enableFxTracking(trx, fixture);

    const original = await createLedgerRecord({
      data: buildFxLedgerData(fixture, {
        bankAmount: 1000,
        receivableAmount: -1000,
      }),
      companyId: fixture.companyId,
      userId: fixture.userId,
      trx,
    });
    expect(original.success).toBe(true);

    const superseded = await supersedeLedgerTransaction({
      oldLedgerTransactionId: original.data!.ledgerTransactionId,
      newData: buildFxLedgerData(fixture, {
        bankAmount: 1200,
        receivableAmount: -1200,
      }),
      companyId: fixture.companyId,
      userId: fixture.userId,
      trx,
    });

    expect(superseded.success).toBe(true);

    const oldPositions = await trx('fx_positions')
      .where({ company_id: fixture.companyId, state: 'closed' })
      .orderBy('created_at');
    expect(oldPositions).toHaveLength(2);

    const openPositions = await trx('fx_positions')
      .where({ company_id: fixture.companyId, state: 'open' })
      .orderBy('account_id');
    expect(openPositions).toHaveLength(2);
    expect(
      openPositions.map((position) => Number(position.open_fx_amount)).sort(),
    ).toEqual([-1200, 1200]);

    const movements = await trx('fx_position_movements').where({
      company_id: fixture.companyId,
    });
    expect(movements).toHaveLength(6);
    expect(
      movements.filter(
        (movement) => movement.movement_type === 'superseded_reversed',
      ),
    ).toHaveLength(2);
    expect(
      movements.filter(
        (movement) => movement.source_type === 'ledger_supersession',
      ),
    ).toHaveLength(2);
  });
});

async function createFixture(trx: Knex.Transaction): Promise<TestFixture> {
  const [user] = await trx('users')
    .insert({
      firstname: 'FX',
      lastname: 'Tester',
      email: `fx-${randomUUID()}@example.com`,
      user_type: 'regular',
    })
    .returning<{ id: string }[]>('id');
  if (!user) throw new Error('Failed to create FX test user');

  const usd = await trx('currencies')
    .where({ code: 'USD' })
    .select<{ id: string }[]>('id')
    .first();
  const eur = await trx('currencies')
    .where({ code: 'EUR' })
    .select<{ id: string }[]>('id')
    .first();
  const country = await trx('countries')
    .where({ code: 'US' })
    .select<{ id: string }[]>('id')
    .first();
  if (!usd || !eur || !country) {
    throw new Error('Required currency or country bootstrap rows not found');
  }

  const [company] = await trx('companies')
    .insert({
      legal_name: 'FX Test Company',
      short_code: `fx-${randomUUID().slice(0, 8)}`,
      type: 'business',
      year_end_day: 31,
      year_end_month: 12,
      accounting_basis: 'modified_accrual_basis',
      country_id: country.id,
      reporting_currency_id: usd.id,
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!company) throw new Error('Failed to create FX test company');

  const bankType = await trx('account_types')
    .where({ key: 'ca_bank' })
    .select<{ id: string }[]>('id')
    .first();
  const receivableType = await trx('account_types')
    .where({ key: 'ca_trade_receivable' })
    .select<{ id: string }[]>('id')
    .first();
  if (!bankType || !receivableType) {
    throw new Error('Required account type bootstrap rows not found');
  }

  const [bankCoa] = await trx('coa')
    .insert({
      company_id: company.id,
      account_type_id: bankType.id,
      currency_id: usd.id,
      name: 'USD Bank',
      code: '1000',
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  const [receivableCoa] = await trx('coa')
    .insert({
      company_id: company.id,
      account_type_id: receivableType.id,
      currency_id: usd.id,
      name: 'Trade Receivables',
      code: '1100',
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!bankCoa || !receivableCoa) {
    throw new Error('Failed to create FX test COAs');
  }

  await trx('exchange_rates')
    .insert({
      rate_date: '2025-01-15',
      base_currency_id: eur.id,
      price_currency_id: usd.id,
      rate: '1.1000000000',
      source: 'manual',
      provider: 'test',
    })
    .onConflict(['rate_date', 'base_currency_id', 'price_currency_id'])
    .merge(['rate', 'source', 'provider', 'updated_at']);

  return {
    companyId: company.id,
    userId: user.id,
    usdCurrencyId: usd.id,
    eurCurrencyId: eur.id,
    bankCoaId: bankCoa.id,
    receivableCoaId: receivableCoa.id,
  };
}

async function enableFxTracking(
  trx: Knex.Transaction,
  fixture: TestFixture,
): Promise<void> {
  const result = await setCompanySettings({
    companyId: fixture.companyId,
    settings: [{ key: 'track_fx_positions', value: true }],
    userId: fixture.userId,
    trx,
  });
  expect(result.success).toBe(true);
}

function buildFxLedgerData(
  fixture: TestFixture,
  amounts: { bankAmount: number; receivableAmount: number },
): NewLedgerTransactionData {
  return {
    transaction_date: '2025-01-15',
    transaction_source: 'manual_journal',
    source_transaction_id: randomUUID(),
    categorization_source: 'manual',
    source_transaction_currency_id: fixture.eurCurrencyId,
    transactions: [
      {
        fs_date: '2025-01-15',
        coa_id: fixture.bankCoaId,
        source_currency_id: fixture.eurCurrencyId,
        source_amount: amounts.bankAmount,
        custom_exchange_rate: 1.1,
        description: 'EUR bank movement',
      },
      {
        fs_date: '2025-01-15',
        coa_id: fixture.receivableCoaId,
        source_currency_id: fixture.eurCurrencyId,
        source_amount: amounts.receivableAmount,
        custom_exchange_rate: 1.1,
        description: 'EUR receivable movement',
      },
    ],
  };
}
