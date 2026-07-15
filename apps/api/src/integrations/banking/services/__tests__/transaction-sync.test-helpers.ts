import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { vi } from 'vitest';

import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../../test/helpers.js';
import { encrypt } from '../../../../shared/utils/crypto.utils.js';
import { TransactionSyncStrategy } from '../../types/base.js';

import type {
  BankingProvider,
  ProviderError,
  ProviderTransaction,
  TransactionSyncResult,
} from '../../types/base.js';

export async function createSyncFailureFixture(db: Knex): Promise<{
  bankAccountId: string;
  providerBankAccountId: string;
  connectionId: string;
  feedId: string;
  companyId: string;
  userId: string;
  restoreRole: () => Promise<void>;
}> {
  const setup = await db.transaction();
  let companyId: string;
  let userId: string;
  let currencyId: string;
  try {
    companyId = await getTestCompanyId(setup, 'indDemoUS');
    userId = await getTestUserId(setup, US_USER_EMAIL);
    currencyId = await getCurrencyId(setup, 'USD');
    await setup.commit();
  } catch (error) {
    await setup.rollback();
    throw error;
  }

  const [bank, provider, coa] = await Promise.all([
    db('banks').select('id').first<{ id: string }>(),
    db('bank_feed_providers')
      .where({ key: 'plaid' })
      .select('id')
      .first<{ id: string }>(),
    db('coa')
      .where({ company_id: companyId, is_deleted: false })
      .select('id')
      .first<{ id: string }>(),
  ]);
  if (!bank || !provider || !coa) {
    throw new Error('Expected bank, Plaid provider, and company COA fixtures');
  }

  const restoreRole = await ensureClientOwnerRole(db, {
    companyId,
    userId,
    actorUserId: userId,
  });

  const [connection] = await db('bank_connections')
    .insert({
      company_id: companyId,
      provider_id: provider.id,
      provider_item_id: `item-${randomUUID()}`,
      authorization_status: 'active',
      connected_by_id: userId,
    })
    .returning('id');

  await db('bank_connection_secrets').insert({
    bank_connection_id: connection.id,
    encrypted_access_token: encrypt(
      `access-${randomUUID()}`,
      `${connection.id}:${companyId}`,
    ),
    encryption_key_version: 1,
  });

  const [bankAccount] = await db('bank_accounts')
    .insert({
      display_name: `Auth failure bank ${randomUUID()}`,
      account_number_mask: '1234',
      account_type: 'checkings_current',
      business_or_personal: 'business',
      bank_id: bank.id,
      currency_id: currencyId,
      company_id: companyId,
      coa_id: coa.id,
      created_by_id: userId,
      updated_by_id: userId,
    })
    .returning('id');

  const providerBankAccountId = `provider-account-${randomUUID()}`;
  const [feed] = await db('bank_account_feeds')
    .insert({
      company_id: companyId,
      bank_account_id: bankAccount.id,
      bank_connection_id: connection.id,
      provider_account_id: providerBankAccountId,
      connected_by_id: userId,
    })
    .returning('id');

  return {
    bankAccountId: bankAccount.id,
    providerBankAccountId,
    connectionId: connection.id,
    feedId: feed.id,
    companyId,
    userId,
    restoreRole,
  };
}

export function fakeProvider(
  syncTransactions: BankingProvider['syncTransactions'],
  transactionSyncStrategy = TransactionSyncStrategy.CURSOR_BASED,
): BankingProvider {
  return {
    key:
      transactionSyncStrategy === TransactionSyncStrategy.CURSOR_BASED
        ? 'plaid'
        : 'mono',
    name: 'Fake provider',
    initialTransactionHistoryDays: 730,
    transactionSyncStrategy,
    createLinkToken: vi.fn(),
    exchangeToken: vi.fn(),
    getConnectionDetails: vi.fn(),
    supportsTransactionSync: vi.fn(() => true),
    syncTransactions,
    handleError: vi.fn((error) => error as ProviderError),
  } as unknown as BankingProvider;
}

export function emptyPage(
  nextCursor: string,
  hasMore: boolean,
): TransactionSyncResult {
  return {
    transactions: { added: [], modified: [], removed: [] },
    nextCursor,
    hasMore,
  };
}

export function providerTransaction(
  providerBankAccountId: string,
  transactionId: string,
): ProviderTransaction {
  return {
    transactionId,
    providerBankAccountId,
    date: '2026-01-15',
    amount: 42,
    description: 'Test transaction',
    currencyCode: 'USD',
    pending: false,
    rawData: { transactionId },
  };
}

export async function createSiblingBankAccount(
  db: Knex,
  fixture: {
    bankAccountId: string;
    connectionId: string;
    userId: string;
  },
): Promise<string> {
  const source = await db('bank_accounts')
    .where({ id: fixture.bankAccountId })
    .first('bank_id', 'currency_id', 'company_id', 'coa_id');
  const [account] = await db('bank_accounts')
    .insert({
      display_name: `Sibling sync account ${randomUUID()}`,
      account_number_mask: '5678',
      account_type: 'checkings_current',
      business_or_personal: 'business',
      bank_id: source.bank_id,
      currency_id: source.currency_id,
      company_id: source.company_id,
      coa_id: source.coa_id,
      created_by_id: fixture.userId,
      updated_by_id: fixture.userId,
    })
    .returning('id');

  await db('bank_account_feeds').insert({
    company_id: source.company_id,
    bank_account_id: account.id,
    bank_connection_id: fixture.connectionId,
    provider_account_id: `provider-sibling-${randomUUID()}`,
    connected_by_id: fixture.userId,
  });

  return account.id;
}

/** Delete a bank account and everything scoped to its feed, in FK order. */
export async function cleanupBankAccountAndFeed(
  db: Knex,
  bankAccountId: string,
): Promise<void> {
  await db('app.outbox')
    .whereRaw(`payload::text LIKE ?`, [`%${bankAccountId}%`])
    .delete();
  await db.transaction(async (trx) => {
    await trx.raw("SELECT set_config('app.demo_seed_teardown', 'on', true)");
    const feed = await trx('bank_account_feeds')
      .where({ bank_account_id: bankAccountId })
      .first<{ id: string }>('id');
    if (feed) {
      await trx('bank_transaction_feed_entries')
        .where({ bank_account_feed_id: feed.id })
        .delete();
    }
    await trx('bank_transactions')
      .where({ bank_account_id: bankAccountId })
      .delete();
    await trx('bank_transaction_batches')
      .where({ bank_account_id: bankAccountId })
      .delete();
    if (feed) {
      await trx('bank_transaction_sync_runs')
        .where({ bank_account_feed_id: feed.id })
        .delete();
    }
    await trx('bank_account_feeds')
      .where({ bank_account_id: bankAccountId })
      .delete();
    await trx('bank_accounts').where({ id: bankAccountId }).delete();
  });
}

export async function cleanupSyncFailureFixture(
  db: Knex,
  fixture: {
    bankAccountId: string;
    connectionId: string;
    restoreRole: () => Promise<void>;
  },
): Promise<void> {
  await db('app.comms_deliveries')
    .whereRaw(`payload_data->>'bankAccountId' = ?`, [fixture.bankAccountId])
    .delete();
  // The failure handler writes real (non-transactional) outbox intents for
  // this connection/account; delete them so repeated test runs don't leave
  // orphaned rows that unrelated tests' broad outbox queries can pick up.
  await db('app.outbox')
    .whereRaw(`payload->'event'->>'attentionKey' = ?`, [
      `bank_account:${fixture.bankAccountId}:reconnect`,
    ])
    .orWhereRaw(`payload->'event'->>'attentionKey' = ?`, [
      `bank_account:${fixture.bankAccountId}:sync_failure`,
    ])
    .orWhereRaw(`payload->>'attentionKey' = ?`, [
      `bank_account:${fixture.bankAccountId}:reconnect`,
    ])
    .delete();
  await cleanupBankAccountAndFeed(db, fixture.bankAccountId);
  await db('bank_connection_secrets')
    .where({ bank_connection_id: fixture.connectionId })
    .delete();
  await db('bank_connections').where({ id: fixture.connectionId }).delete();
  await fixture.restoreRole();
}

async function ensureClientOwnerRole(
  db: Knex,
  input: { companyId: string; userId: string; actorUserId: string },
): Promise<() => Promise<void>> {
  const role = await db('roles')
    .where({ key: 'client_owner' })
    .first<{ id: string }>('id');
  if (!role) {
    throw new Error('client_owner role fixture not found');
  }

  const existing = await db('user_company_roles')
    .where({
      company_id: input.companyId,
      user_id: input.userId,
      is_deleted: false,
    })
    .first<{
      id: string;
      role_id: string;
      updated_by_id: string | null;
      updated_at: Date | string;
    }>('id', 'role_id', 'updated_by_id', 'updated_at');

  if (existing) {
    await db('user_company_roles').where({ id: existing.id }).update({
      role_id: role.id,
      updated_by_id: input.actorUserId,
      updated_at: db.fn.now(),
    });
    return async () => {
      await db('user_company_roles').where({ id: existing.id }).update({
        role_id: existing.role_id,
        updated_by_id: existing.updated_by_id,
        updated_at: existing.updated_at,
      });
    };
  }

  const [inserted] = await db('user_company_roles')
    .insert({
      company_id: input.companyId,
      user_id: input.userId,
      role_id: role.id,
      created_by_id: input.actorUserId,
    })
    .returning('id');
  return async () => {
    await db('user_company_roles').where({ id: inserted.id }).delete();
  };
}
