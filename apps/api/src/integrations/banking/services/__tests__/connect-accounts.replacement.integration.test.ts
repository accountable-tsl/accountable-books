import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import { deriveAccountNumberIdentity } from '../../../../domains/banking/account-identity.js';
import { createHistoryImport } from '../../../../domains/banking/bank-transaction-history/bank-transaction-history.model.js';
import { providerRegistry } from '../../providers/registry.js';
import { connectAccountsService } from '../connect-accounts.service.js';
import {
  cleanupSyncFailureFixture,
  createSyncFailureFixture,
  emptyPage,
  fakeProvider,
} from './transaction-sync.test-helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bank connection replacement (fingerprint rematch)', () => {
  it('replaces feeds onto the same durable bank account when provider account ids change', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const accountNumber = `4400${Date.now().toString().slice(-8)}`;
    const identity = deriveAccountNumberIdentity(accountNumber);
    let replacementConnectionId: string | null = null;

    try {
      const account = await db('bank_accounts')
        .where({ id: fixture.bankAccountId })
        .first<{
          bank_id: string;
          display_name: string;
        }>('bank_id', 'display_name');
      if (!account) throw new Error('Expected fixture bank account');

      await db('bank_accounts').where({ id: fixture.bankAccountId }).update({
        account_number_fingerprint: identity.account_number_fingerprint,
        account_number_fingerprint_version:
          identity.account_number_fingerprint_version,
        account_number_mask: identity.account_number_mask,
      });

      await db.transaction(async (trx) => {
        await createHistoryImport({
          bankAccountFeedId: fixture.feedId,
          companyId: fixture.companyId,
          trx,
        });
      });

      const provider = fakeProvider(async () => emptyPage('', false));
      const newProviderAccountId = `new-provider-account-${randomUUID()}`;
      provider.exchangeToken = vi.fn().mockResolvedValue({
        accessToken: `access-${randomUUID()}`,
        itemId: `item-replacement-${randomUUID()}`,
      });
      provider.getConnectionDetails = vi.fn().mockResolvedValue({
        connection: { id: 'ignored', metadata: {} },
        institution: {
          systemInstitutionId: account.bank_id,
          providerInstitutionId: 'institution-1',
          name: 'Test Bank',
          countryCode: 'US',
          rawData: {},
        },
        bankAccounts: [
          {
            accountId: newProviderAccountId,
            displayName: account.display_name,
            officialName: account.display_name,
            accountNumber,
            mask: identity.account_number_mask,
            currencyCode: 'USD',
            type: 'checkings_current',
            rawData: {},
            balance: 0,
            balanceDate: new Date(),
          },
        ],
      });

      vi.spyOn(providerRegistry, 'get').mockResolvedValue(provider);

      const result = await connectAccountsService.connectBankAccounts({
        providerKey: 'plaid',
        countryCode: 'US',
        publicToken: `public-${randomUUID()}`,
        companyId: fixture.companyId,
        userId: fixture.userId,
      });

      expect(result.success).toBe(true);
      expect(result.data?.outcome).toBe('replaced');
      expect(result.data?.accounts).toEqual([
        expect.objectContaining({
          id: fixture.bankAccountId,
          linkage: 'existing',
        }),
      ]);

      const oldConnection = await db('bank_connections')
        .where({ id: fixture.connectionId })
        .first<{ authorization_status: string }>('authorization_status');
      expect(oldConnection?.authorization_status).toBe('revoked');

      const oldFeed = await db('bank_account_feeds')
        .where({ id: fixture.feedId })
        .first<{ revoked_at: Date | null }>('revoked_at');
      expect(oldFeed?.revoked_at).toBeTruthy();

      const newFeed = await db('bank_account_feeds')
        .where({
          bank_account_id: fixture.bankAccountId,
          company_id: fixture.companyId,
        })
        .whereNull('revoked_at')
        .first<{
          id: string;
          provider_account_id: string;
          replaces_bank_account_feed_id: string | null;
          bank_connection_id: string;
        }>(
          'id',
          'provider_account_id',
          'replaces_bank_account_feed_id',
          'bank_connection_id',
        );

      expect(newFeed).toBeTruthy();
      expect(newFeed!.id).not.toBe(fixture.feedId);
      expect(newFeed!.provider_account_id).toBe(newProviderAccountId);
      expect(newFeed!.replaces_bank_account_feed_id).toBe(fixture.feedId);
      expect(newFeed!.bank_connection_id).not.toBe(fixture.connectionId);
      replacementConnectionId = newFeed!.bank_connection_id;

      const activeFeedCount = await db('bank_account_feeds')
        .where({
          bank_account_id: fixture.bankAccountId,
          company_id: fixture.companyId,
        })
        .whereNull('revoked_at')
        .count<{ count: string }>('id as count')
        .first();
      expect(activeFeedCount?.count).toBe('1');

      expect(result.data?.accounts[0]?.feedId).toBe(newFeed!.id);
    } finally {
      await cleanupSyncFailureFixture(
        db,
        fixture,
        replacementConnectionId ? [replacementConnectionId] : [],
      );
    }
  });
});
