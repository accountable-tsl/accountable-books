import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCountryId,
  getCurrencyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { upsertFeedEntry } from '../bank-transaction-feed-entries/bank-transaction-feed-entries.model.js';

interface CompanyFixture {
  id: string;
  coaId: string;
  connectionId: string;
  feedId: string;
  bankAccountId: string;
  /** A second bank account with no feed yet, for feed-FK-violation tests. */
  spareBankAccountId: string;
  batchId: string;
}

interface Fixture {
  userId: string;
  providerId: string;
  bankId: string;
  currencyId: string;
  companyA: CompanyFixture;
  companyB: CompanyFixture;
}

describe('banking database integrity', () => {
  let trx: Knex.Transaction;
  let fixture: Fixture;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    await trx.raw('SET LOCAL search_path TO app, public');
    fixture = await createFixture(trx);
  });

  afterEach(async () => {
    if (trx) await trx.rollback();
  });

  it('rejects a bank account feed when the connection belongs to a different company', async () => {
    await expectForeignKeyViolation(
      insertFeed(trx, {
        bankAccountId: fixture.companyA.spareBankAccountId,
        bankConnectionId: fixture.companyB.connectionId,
        companyId: fixture.companyA.id,
        userId: fixture.userId,
      }),
      'bank_account_feeds_connection_company_fk',
    );
  });

  it('rejects a bank account feed when the bank account belongs to a different company', async () => {
    await expectForeignKeyViolation(
      insertFeed(trx, {
        bankAccountId: fixture.companyB.spareBankAccountId,
        bankConnectionId: fixture.companyA.connectionId,
        companyId: fixture.companyA.id,
        userId: fixture.userId,
      }),
      'bank_account_feeds_account_company_fk',
    );
  });

  it('does not reuse a provider account identity within one connection after revocation', async () => {
    const existing = await trx('bank_account_feeds')
      .where({ id: fixture.companyA.feedId })
      .first<{ provider_account_id: string }>('provider_account_id');
    if (!existing) throw new Error('Expected the fixture feed');

    await trx('bank_account_feeds')
      .where({ id: fixture.companyA.feedId })
      .update({
        revoked_at: trx.fn.now(),
        revocation_origin: 'provider',
        revocation_reason: 'test replacement',
      });

    await expect(
      insertFeed(trx, {
        bankAccountId: fixture.companyA.spareBankAccountId,
        bankConnectionId: fixture.companyA.connectionId,
        companyId: fixture.companyA.id,
        providerAccountId: existing.provider_account_id,
        userId: fixture.userId,
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects an import batch when the bank account belongs to a different company', async () => {
    await expectForeignKeyViolation(
      insertBatch(trx, {
        bankAccountId: fixture.companyA.bankAccountId,
        companyId: fixture.companyB.id,
        bankAccountFeedId: null,
        source: 'manual_entry',
        userId: fixture.userId,
      }),
      'bank_transaction_batches_account_company_fk',
    );
  });

  it('rejects a bank-feed batch when the feed belongs to a different company', async () => {
    await expectForeignKeyViolation(
      insertBatch(trx, {
        bankAccountId: fixture.companyA.bankAccountId,
        companyId: fixture.companyA.id,
        bankAccountFeedId: fixture.companyB.feedId,
        source: 'bank_feed',
        userId: fixture.userId,
      }),
      'bank_transaction_batches_feed_company_fk',
    );
  });

  it('rejects a transaction when company_id does not match the bank account and batch tuple', async () => {
    await expectForeignKeyViolation(
      insertTransaction(trx, {
        bankAccountId: fixture.companyA.bankAccountId,
        bankTransactionBatchId: fixture.companyA.batchId,
        companyId: fixture.companyB.id,
        userId: fixture.userId,
      }),
    );
  });

  it('rejects a transaction when the batch belongs to a different bank account/company tuple', async () => {
    await expectForeignKeyViolation(
      insertTransaction(trx, {
        bankAccountId: fixture.companyA.bankAccountId,
        bankTransactionBatchId: fixture.companyB.batchId,
        companyId: fixture.companyA.id,
        userId: fixture.userId,
      }),
      'bank_transactions_batch_account_company_fk',
    );
  });

  it('accepts a transaction when company, bank account, and batch are consistent', async () => {
    const transactionId = await insertTransaction(trx, {
      bankAccountId: fixture.companyA.bankAccountId,
      bankTransactionBatchId: fixture.companyA.batchId,
      companyId: fixture.companyA.id,
      userId: fixture.userId,
    });

    expect(transactionId).toEqual(expect.any(String));
  });

  it('throws transactional feed-entry failures so a sync update unit must roll back', async () => {
    const transactionId = await insertTransaction(trx, {
      bankAccountId: fixture.companyA.bankAccountId,
      bankTransactionBatchId: fixture.companyA.batchId,
      companyId: fixture.companyA.id,
      userId: fixture.userId,
    });

    await expect(
      upsertFeedEntry({
        data: {
          bank_account_feed_id: fixture.companyA.feedId,
          company_id: fixture.companyB.id,
          provider_transaction_id: randomUUID(),
          bank_transaction_id: transactionId,
          observation_type: 'added',
          provider_evidence: {},
          provider_evidence_schema_version: 1,
          observed_at: new Date(),
        },
        trx,
      }),
    ).rejects.toThrow();
  });

  it('scopes provider transaction identity to the feed', async () => {
    const spareFeedId = await insertFeed(trx, {
      bankAccountId: fixture.companyA.spareBankAccountId,
      bankConnectionId: fixture.companyA.connectionId,
      companyId: fixture.companyA.id,
      userId: fixture.userId,
    });
    const transactionId = await insertTransaction(trx, {
      bankAccountId: fixture.companyA.bankAccountId,
      bankTransactionBatchId: fixture.companyA.batchId,
      companyId: fixture.companyA.id,
      userId: fixture.userId,
    });
    const providerTransactionId = `shared-${randomToken()}`;

    for (const feedId of [fixture.companyA.feedId, spareFeedId]) {
      const result = await upsertFeedEntry({
        data: {
          bank_account_feed_id: feedId,
          company_id: fixture.companyA.id,
          provider_transaction_id: providerTransactionId,
          bank_transaction_id: transactionId,
          observation_type: 'added',
          provider_evidence: {},
          provider_evidence_schema_version: 1,
          observed_at: new Date(),
        },
        trx,
      });
      expect(result.success).toBe(true);
    }

    await expect(
      trx('bank_transaction_feed_entries')
        .where({ provider_transaction_id: providerTransactionId })
        .count<{ count: string }[]>('* as count'),
    ).resolves.toEqual([{ count: '2' }]);
  });

  it('never re-points a canonical link on later observations', async () => {
    const firstTransactionId = await insertTransaction(trx, {
      bankAccountId: fixture.companyA.bankAccountId,
      bankTransactionBatchId: fixture.companyA.batchId,
      companyId: fixture.companyA.id,
      userId: fixture.userId,
    });
    const secondTransactionId = await insertTransaction(trx, {
      bankAccountId: fixture.companyA.bankAccountId,
      bankTransactionBatchId: fixture.companyA.batchId,
      companyId: fixture.companyA.id,
      userId: fixture.userId,
    });

    const providerTransactionId = `reviewed-${randomToken()}`;

    await upsertFeedEntry({
      data: {
        bank_account_feed_id: fixture.companyA.feedId,
        company_id: fixture.companyA.id,
        provider_transaction_id: providerTransactionId,
        bank_transaction_id: firstTransactionId,
        observation_type: 'added',
        provider_evidence: { version: 1 },
        provider_evidence_schema_version: 1,
        observed_at: new Date(),
      },
      trx,
    });

    await upsertFeedEntry({
      data: {
        bank_account_feed_id: fixture.companyA.feedId,
        company_id: fixture.companyA.id,
        provider_transaction_id: providerTransactionId,
        bank_transaction_id: secondTransactionId,
        observation_type: 'modified',
        provider_evidence: { version: 2 },
        provider_evidence_schema_version: 1,
        observed_at: new Date(),
      },
      trx,
    });

    await expect(
      trx('bank_transaction_feed_entries')
        .where({
          bank_account_feed_id: fixture.companyA.feedId,
          provider_transaction_id: providerTransactionId,
        })
        .first('bank_transaction_id', 'observation_type', 'provider_evidence'),
    ).resolves.toEqual({
      bank_transaction_id: firstTransactionId,
      observation_type: 'modified',
      provider_evidence: { version: 2 },
    });
  });

  it('rejects a superseded_by link on a transaction that is not retired', async () => {
    const originalId = await insertTransaction(trx, {
      bankAccountId: fixture.companyA.bankAccountId,
      bankTransactionBatchId: fixture.companyA.batchId,
      companyId: fixture.companyA.id,
      userId: fixture.userId,
    });
    const replacementId = await insertTransaction(trx, {
      bankAccountId: fixture.companyA.bankAccountId,
      bankTransactionBatchId: fixture.companyA.batchId,
      companyId: fixture.companyA.id,
      userId: fixture.userId,
    });

    // Savepoint so the expected violation does not abort the outer test trx.
    await expect(
      trx.transaction((inner) =>
        inner('bank_transactions').where({ id: originalId }).update({
          superseded_by_bank_transaction_id: replacementId,
        }),
      ),
    ).rejects.toMatchObject({
      constraint: 'bank_transactions_superseded_by_chk',
    });

    await trx('bank_transactions').where({ id: originalId }).update({
      is_deleted: true,
      deleted_at: trx.fn.now(),
      deletion_origin: 'provider_sync',
      deletion_reason: 'Superseded by provider correction',
      superseded_by_bank_transaction_id: replacementId,
    });

    await expect(
      trx('bank_transactions')
        .where({ id: originalId })
        .first('superseded_by_bank_transaction_id'),
    ).resolves.toEqual({ superseded_by_bank_transaction_id: replacementId });
  });

  it('rejects a feed entry whose canonical transaction belongs to another company', async () => {
    const foreignTransactionId = await insertTransaction(trx, {
      bankAccountId: fixture.companyB.bankAccountId,
      bankTransactionBatchId: fixture.companyB.batchId,
      companyId: fixture.companyB.id,
      userId: fixture.userId,
    });

    await expect(
      upsertFeedEntry({
        data: {
          bank_account_feed_id: fixture.companyA.feedId,
          company_id: fixture.companyA.id,
          provider_transaction_id: `foreign-transaction-${randomToken()}`,
          bank_transaction_id: foreignTransactionId,
          observation_type: 'added',
          provider_evidence: {},
          provider_evidence_schema_version: 1,
          observed_at: new Date(),
        },
        trx,
      }),
    ).rejects.toThrow();
  });

  it('rejects a batch whose sync run belongs to another feed or company', async () => {
    const [run] = await trx('bank_transaction_sync_runs')
      .insert({
        bank_account_feed_id: fixture.companyB.feedId,
        company_id: fixture.companyB.id,
        trigger: 'scheduler',
        sync_mode: 'incremental',
        outcome: 'running',
        observed_state_version: 1,
      })
      .returning<{ id: string }[]>('id');

    await expectForeignKeyViolation(
      insertBatch(trx, {
        bankAccountId: fixture.companyA.bankAccountId,
        bankAccountFeedId: fixture.companyA.feedId,
        companyId: fixture.companyA.id,
        source: 'bank_feed',
        syncRunId: run.id,
        userId: fixture.userId,
      }),
      'bank_transaction_batches_sync_run_feed_company_fk',
    );
  });

  it('rejects active connection rows carrying requires-action state', async () => {
    await expect(
      trx('bank_connections').insert({
        company_id: fixture.companyA.id,
        provider_id: fixture.providerId,
        authorization_status: 'active',
        requires_action_at: trx.fn.now(),
        connected_by_id: fixture.userId,
      }),
    ).rejects.toMatchObject({ constraint: 'bank_connections_lifecycle_chk' });
  });

  it('rejects revoked connection rows carrying requires-action state', async () => {
    await expect(
      trx('bank_connections').insert({
        company_id: fixture.companyA.id,
        provider_id: fixture.providerId,
        authorization_status: 'revoked',
        requires_action_at: trx.fn.now(),
        revoked_at: trx.fn.now(),
        revocation_origin: 'provider',
        connected_by_id: fixture.userId,
      }),
    ).rejects.toMatchObject({ constraint: 'bank_connections_lifecycle_chk' });
  });
});

async function createFixture(trx: Knex.Transaction): Promise<Fixture> {
  const userId = await getTestUserId(trx, US_USER_EMAIL);
  const countryId = await getCountryId(trx, 'US');
  const currencyId = await getCurrencyId(trx, 'USD');
  const providerId = await ensureProvider(trx, userId);
  const bankId = await ensureBank(trx, { countryId, userId });

  const companyA = await createCompanyFixture(trx, {
    bankId,
    currencyId,
    label: 'a',
    providerId,
    userId,
  });
  const companyB = await createCompanyFixture(trx, {
    bankId,
    currencyId,
    label: 'b',
    providerId,
    userId,
  });

  return {
    bankId,
    companyA,
    companyB,
    currencyId,
    providerId,
    userId,
  };
}

async function createCompanyFixture(
  trx: Knex.Transaction,
  params: {
    bankId: string;
    currencyId: string;
    label: string;
    providerId: string;
    userId: string;
  },
): Promise<CompanyFixture> {
  const companyId = await insertCompany(trx, {
    currencyId: params.currencyId,
    label: params.label,
    userId: params.userId,
  });
  const coaId = await insertCoa(trx, {
    companyId,
    currencyId: params.currencyId,
    label: params.label,
    userId: params.userId,
  });
  const connectionId = await insertConnection(trx, {
    companyId,
    providerId: params.providerId,
    userId: params.userId,
  });
  const bankAccountId = await insertBankAccount(trx, {
    bankId: params.bankId,
    companyId,
    coaId,
    currencyId: params.currencyId,
    userId: params.userId,
  });
  const feedId = await insertFeed(trx, {
    bankAccountId,
    bankConnectionId: connectionId,
    companyId,
    userId: params.userId,
  });
  const batchId = await insertBatch(trx, {
    bankAccountId,
    companyId,
    bankAccountFeedId: feedId,
    source: 'bank_feed',
    userId: params.userId,
  });
  const spareBankAccountId = await insertBankAccount(trx, {
    bankId: params.bankId,
    companyId,
    coaId,
    currencyId: params.currencyId,
    userId: params.userId,
  });

  return {
    bankAccountId,
    spareBankAccountId,
    batchId,
    coaId,
    connectionId,
    feedId,
    id: companyId,
  };
}

async function ensureProvider(
  trx: Knex.Transaction,
  userId: string,
): Promise<string> {
  const existing = await trx('bank_feed_providers').select('id').first();
  if (existing) return existing.id;

  const [provider] = await trx('bank_feed_providers')
    .insert({
      created_by_id: userId,
      display_name: 'Integrity Test Provider',
      key: `integrity_test_${randomToken()}`,
    })
    .returning<{ id: string }[]>('id');

  return provider.id;
}

async function ensureBank(
  trx: Knex.Transaction,
  params: { countryId: string; userId: string },
): Promise<string> {
  const existing = await trx('banks').select('id').first();
  if (existing) return existing.id;

  const [bank] = await trx('banks')
    .insert({
      country_id: params.countryId,
      created_by_id: params.userId,
      display_name: 'Integrity Test Bank',
      key: `us_integrity_test_${randomToken()}`,
    })
    .returning<{ id: string }[]>('id');

  return bank.id;
}

async function insertCompany(
  trx: Knex.Transaction,
  params: { currencyId: string; label: string; userId: string },
): Promise<string> {
  const countryId = await getCountryId(trx, 'US');
  const token = randomToken();
  const [company] = await trx('companies')
    .insert({
      accounting_basis: 'modified_accrual_basis',
      country_id: countryId,
      created_by_id: params.userId,
      display_name: `Integrity ${params.label.toUpperCase()}`,
      legal_name: `Integrity ${params.label.toUpperCase()} LLC`,
      reporting_currency_id: params.currencyId,
      short_code: `int_${params.label}_${token}`,
      type: 'business',
      year_end_day: 31,
      year_end_month: 12,
    })
    .returning<{ id: string }[]>('id');

  return company.id;
}

async function insertCoa(
  trx: Knex.Transaction,
  params: {
    companyId: string;
    currencyId: string;
    label: string;
    userId: string;
  },
): Promise<string> {
  const accountType = await trx('account_types')
    .where('key', 'ca_bank')
    .select('id')
    .first();
  if (!accountType) throw new Error('account_types.ca_bank not found');

  const [coa] = await trx('coa')
    .insert({
      account_type_id: accountType.id,
      code: `100-${params.label}-${randomToken()}`,
      company_id: params.companyId,
      created_by_id: params.userId,
      currency_id: params.currencyId,
      name: `Integrity Bank ${params.label.toUpperCase()}`,
    })
    .returning<{ id: string }[]>('id');

  return coa.id;
}

async function insertConnection(
  trx: Knex.Transaction,
  params: { companyId: string; providerId: string; userId: string },
): Promise<string> {
  const [connection] = await trx('bank_connections')
    .insert({
      company_id: params.companyId,
      provider_id: params.providerId,
      connected_by_id: params.userId,
    })
    .returning<{ id: string }[]>('id');

  return connection.id;
}

async function insertBankAccount(
  trx: Knex.Transaction,
  params: {
    bankId: string;
    companyId: string;
    coaId: string;
    currencyId: string;
    userId: string;
  },
): Promise<string> {
  const token = randomToken();
  const [bankAccount] = await trx('bank_accounts')
    .insert({
      account_type: 'checkings_current',
      bank_id: params.bankId,
      business_or_personal: 'business',
      coa_id: params.coaId,
      company_id: params.companyId,
      created_by_id: params.userId,
      currency_id: params.currencyId,
      display_name: `Integrity Account ${token}`,
    })
    .returning<{ id: string }[]>('id');

  return bankAccount.id;
}

async function insertFeed(
  trx: Knex.Transaction,
  params: {
    bankAccountId: string;
    bankConnectionId: string;
    companyId: string;
    providerAccountId?: string;
    userId: string;
  },
): Promise<string> {
  const [feed] = await trx('bank_account_feeds')
    .insert({
      bank_account_id: params.bankAccountId,
      bank_connection_id: params.bankConnectionId,
      company_id: params.companyId,
      connected_by_id: params.userId,
      provider_account_id:
        params.providerAccountId ?? `provider-account-${randomToken()}`,
    })
    .returning<{ id: string }[]>('id');

  return feed.id;
}

async function insertBatch(
  trx: Knex.Transaction,
  params: {
    bankAccountId: string;
    companyId: string;
    bankAccountFeedId: string | null;
    source: 'bank_feed' | 'manual_entry';
    syncRunId?: string | null;
    userId: string;
  },
): Promise<string> {
  const [batch] = await trx('bank_transaction_batches')
    .insert({
      bank_account_id: params.bankAccountId,
      bank_account_feed_id: params.bankAccountFeedId,
      company_id: params.companyId,
      created_by_id: params.userId,
      end_date: '2025-03-31',
      fingerprint: `batch-${randomToken()}`,
      import_row_count: 1,
      source: params.source,
      start_date: '2025-03-01',
      bank_transaction_sync_run_id: params.syncRunId ?? null,
    })
    .returning<{ id: string }[]>('id');

  return batch.id;
}

async function insertTransaction(
  trx: Knex.Transaction,
  params: {
    bankAccountId: string;
    bankTransactionBatchId: string;
    companyId: string;
    userId: string;
  },
): Promise<string> {
  const [transaction] = await trx('bank_transactions')
    .insert({
      amount: -42,
      bank_account_id: params.bankAccountId,
      bank_transaction_batch_id: params.bankTransactionBatchId,
      company_id: params.companyId,
      created_by_id: params.userId,
      idempotency_key: `txn-${randomToken()}`,
      system_exchange_rate: 1,
      transaction_at: new Date('2025-03-15T12:00:00Z'),
      transaction_date: '2025-03-15',
    })
    .returning<{ id: string }[]>('id');

  return transaction.id;
}

async function expectForeignKeyViolation(
  operation: Promise<unknown>,
  constraint?: string,
): Promise<void> {
  const expected = constraint
    ? { code: '23503', constraint }
    : { code: '23503' };

  await expect(operation).rejects.toMatchObject(expected);
}

function randomToken(): string {
  return randomUUID().replaceAll('-', '').slice(0, 12);
}
