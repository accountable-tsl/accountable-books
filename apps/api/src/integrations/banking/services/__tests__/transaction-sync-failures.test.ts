import type { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../../test/helpers.js';
import { NOTIFICATION_TYPE } from '../../../../domains/notifications/notifications.types.js';
import { OUTBOX_INTENT } from '../../../../domains/work/work.types.js';
import { encrypt } from '../../../../shared/utils/crypto.utils.js';
import { providerRegistry } from '../../providers/registry.js';
import { TransactionSyncStrategy } from '../../types/base.js';
import {
  classifyTransactionSyncFailure,
  transactionSyncService,
} from '../transaction-sync.service.js';

import type { BankingProvider, ProviderError } from '../../types/base.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('transaction sync failure classification', () => {
  it('classifies provider auth failures as reconnect-required', () => {
    expect(
      classifyTransactionSyncFailure({
        code: 'ITEM_LOGIN_REQUIRED',
        message: 'item login required',
        displayMessage: 'Please reconnect your bank account.',
        retryable: false,
      }),
    ).toEqual(
      expect.objectContaining({
        classification: 'auth_reconnect',
        code: 'ITEM_LOGIN_REQUIRED',
      }),
    );
  });

  it('classifies provider/system failures as admin-alertable', () => {
    expect(
      classifyTransactionSyncFailure({
        code: 'MONO_500',
        message: 'Provider returned 500',
        displayMessage: 'Bank server error. Please try again later.',
        retryable: true,
      }),
    ).toEqual(
      expect.objectContaining({
        classification: 'internal_provider_system',
        code: 'MONO_500',
      }),
    );
  });

  it('classifies unexpected local errors as admin-alertable', () => {
    expect(classifyTransactionSyncFailure(new Error('System user not found')))
      .toEqual(
        expect.objectContaining({
          classification: 'internal_provider_system',
          code: 'UNKNOWN_TRANSACTION_SYNC_ERROR',
        }),
      );
  });

  it('marks connected accounts error and emits reconnect intents on auth sync failure', async () => {
    const db = getTestDb();
    const authError = {
      code: 'ITEM_LOGIN_REQUIRED',
      message: 'item login required',
      displayMessage: 'Please reconnect your bank account.',
      retryable: false,
    } satisfies ProviderError;
    const fakeProvider = {
      key: 'plaid',
      name: 'Fake Plaid',
      transactionSyncStrategy: TransactionSyncStrategy.CURSOR_BASED,
      createLinkToken: vi.fn(),
      exchangeToken: vi.fn(),
      getConnectionDetails: vi.fn(),
      supportsTransactionSync: vi.fn(() => true),
      syncTransactions: vi.fn(async () => {
        throw authError;
      }),
      handleError: vi.fn((error) => error as ProviderError),
    } as unknown as BankingProvider;
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(fakeProvider);

    const fixture = await createSyncFailureFixture(db);

    try {
      await expect(
        transactionSyncService.syncTransactionsForCredential({
          credentialId: fixture.credentialId,
          userId: fixture.userId,
        }),
      ).rejects.toEqual(authError);

      const account = await db('bank_accounts')
        .where({ id: fixture.bankAccountId })
        .first<{ connection_status: string; sync_error: string | null }>(
          'connection_status',
          'sync_error',
        );
      expect(account).toEqual({
        connection_status: 'error',
        sync_error: authError.displayMessage,
      });

      const intents = await db('app.outbox_intents')
        .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
        .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
          NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
        ])
        .andWhereRaw(`payload->'event'->>'attentionKey' = ?`, [
          `bank_account:${fixture.bankAccountId}:reconnect`,
        ]);
      expect(intents.length).toBeGreaterThan(0);
      expect(intents.map((intent) => intent.payload.event)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            recipientUserId: fixture.userId,
            clientCompanyId: fixture.companyId,
            policyOwnerCompanyId: fixture.companyId,
            eventType: NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
            attentionTransition: 'opened',
            data: expect.objectContaining({
              bankAccountId: fixture.bankAccountId,
              connectionStatus: 'error',
              syncError: authError.displayMessage,
            }),
          }),
        ]),
      );
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });
});

async function createSyncFailureFixture(
  db: Knex,
): Promise<{
  bankAccountId: string;
  credentialId: string;
  companyId: string;
  userId: string;
  restoreRole: () => Promise<void>;
}> {
  const setup = await db.transaction();
  let companyId: string;
  let userId: string;
  let currencyId: string;
  try {
    companyId = await getTestCompanyId(setup, 'bizDemoUS');
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
  const [credential] = await db('bank_account_credentials')
    .insert({
      company_id: companyId,
      provider_id: provider.id,
      item_identifier: `item-${randomUUID()}`,
      encrypted_access_token: encrypt(
        `access-${randomUUID()}`,
        `${provider.id}:${companyId}`,
      ),
      raw_metadata: { source: 'test' },
      status: 'active',
      connected_by_id: userId,
    })
    .returning('id');
  const [bankAccount] = await db('bank_accounts')
    .insert({
      display_name: `Auth failure bank ${randomUUID()}`,
      account_number: randomUUID(),
      account_number_mask: '1234',
      account_type: 'checkings_current',
      business_or_personal: 'business',
      bank_id: bank.id,
      currency_id: currencyId,
      company_id: companyId,
      coa_id: coa.id,
      provider_id: provider.id,
      provider_bank_account_id: `provider-account-${randomUUID()}`,
      connection_status: 'connected',
      connection_credential_id: credential.id,
      created_by_id: userId,
      updated_by_id: userId,
    })
    .returning('id');

  return {
    bankAccountId: bankAccount.id,
    credentialId: credential.id,
    companyId,
    userId,
    restoreRole,
  };
}

async function cleanupSyncFailureFixture(
  db: Knex,
  fixture: {
    bankAccountId: string;
    credentialId: string;
    restoreRole: () => Promise<void>;
  },
): Promise<void> {
  await db('app.outbox_intents')
    .whereRaw(`payload::text LIKE ?`, [`%${fixture.bankAccountId}%`])
    .delete();
  await db('bank_accounts').where({ id: fixture.bankAccountId }).delete();
  await db('bank_account_credentials')
    .where({ id: fixture.credentialId })
    .delete();
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
