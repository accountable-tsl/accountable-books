import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import { providerRegistry } from '../../providers/registry.js';
import { connectAccountsService } from '../connect-accounts.service.js';
import {
  cleanupBankAccountAndFeed,
  cleanupSyncFailureFixture,
  createSiblingBankAccount,
  createSyncFailureFixture,
  emptyPage,
  fakeProvider,
} from './transaction-sync.test-helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bank connection reauthorization persistence', () => {
  it('resumes returned accounts and stops omitted accounts atomically', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const omittedBankAccountId = await createSiblingBankAccount(db, fixture);

    try {
      const connection = await db('bank_connections')
        .where({ id: fixture.connectionId })
        .first<{ provider_item_id: string }>('provider_item_id');
      const account = await db('bank_accounts')
        .where({ id: fixture.bankAccountId })
        .first<{
          bank_id: string;
          display_name: string;
          account_number_mask: string;
        }>('bank_id', 'display_name', 'account_number_mask');
      if (!connection?.provider_item_id || !account) {
        throw new Error('Expected reauthorization fixture data');
      }

      await db('bank_connections').where({ id: fixture.connectionId }).update({
        authorization_status: 'requires_action',
        authorization_reason_code: 'ITEM_LOGIN_REQUIRED',
        requires_action_at: db.fn.now(),
      });

      const provider = fakeProvider(async () => emptyPage('', false));
      provider.getConnectionDetails = vi.fn().mockResolvedValue({
        connection: { id: connection.provider_item_id, metadata: {} },
        institution: {
          systemInstitutionId: account.bank_id,
          providerInstitutionId: 'institution-1',
          name: 'Test Bank',
          countryCode: 'US',
          rawData: {},
        },
        bankAccounts: [
          {
            accountId: fixture.providerBankAccountId,
            displayName: account.display_name,
            accountNumber: account.account_number_mask,
            currencyCode: 'USD',
            rawData: {},
            balance: 0,
            balanceDate: new Date(),
          },
        ],
      });
      vi.spyOn(providerRegistry, 'get').mockResolvedValue(provider);

      const result = await connectAccountsService.completeReauthorization({
        connectionId: fixture.connectionId,
        companyId: fixture.companyId,
        userId: fixture.userId,
      });

      expect(result.success).toBe(true);
      expect(result.data?.accounts.map((item) => item.id)).toEqual([
        fixture.bankAccountId,
      ]);
      expect(provider.getConnectionDetails).toHaveBeenCalledWith(
        expect.objectContaining({ knownBankId: account.bank_id }),
      );
      expect(
        await db('bank_connections')
          .where({ id: fixture.connectionId })
          .first('authorization_status'),
      ).toEqual({ authorization_status: 'active' });
      expect(
        await db('bank_account_feeds')
          .where({ bank_account_id: fixture.bankAccountId })
          .first('revoked_at'),
      ).toEqual({ revoked_at: null });
      expect(
        await db('bank_account_feeds')
          .where({ bank_account_id: omittedBankAccountId })
          .first('revoked_at'),
      ).toEqual({ revoked_at: expect.any(Date) });
      expect(
        await db('app.outbox')
          .where({
            scope_key: `bank_account:${fixture.bankAccountId}`,
            status: 'pending',
          })
          .first('id'),
      ).toBeTruthy();
    } finally {
      await cleanupBankAccountAndFeed(db, omittedBankAccountId);
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('rejects a connection that was already revoked', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      await db('bank_connections').where({ id: fixture.connectionId }).update({
        authorization_status: 'revoked',
        authorization_reason_code: null,
        requires_action_at: null,
        revoked_at: db.fn.now(),
        revocation_origin: 'client',
      });
      const providerLookup = vi.spyOn(providerRegistry, 'get');

      const result = await connectAccountsService.completeReauthorization({
        connectionId: fixture.connectionId,
        companyId: fixture.companyId,
        userId: fixture.userId,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('OPERATION_NOT_ALLOWED');
      expect(providerLookup).not.toHaveBeenCalled();
      expect(
        await db('bank_connections')
          .where({ id: fixture.connectionId })
          .first('authorization_status'),
      ).toEqual({ authorization_status: 'revoked' });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });
});
