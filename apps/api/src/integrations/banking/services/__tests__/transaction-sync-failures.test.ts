import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import { NOTIFICATION_TYPE } from '../../../../domains/notifications/notifications.types.js';
import { OUTBOX_INTENT } from '../../../../domains/outbox/intents.js';
import { providerRegistry } from '../../providers/registry.js';
import {
  classifyTransactionSyncFailure,
  isRetryableTransactionSyncFailure,
  transactionSyncService,
} from '../transaction-sync.service.js';
import {
  cleanupBankAccountAndFeed,
  cleanupSyncFailureFixture,
  createSiblingBankAccount,
  createSyncFailureFixture,
} from './transaction-sync.test-helpers.js';

import type { BankingProvider, ProviderError } from '../../types/base.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('transaction sync failure classification', () => {
  it.each([
    [
      'provider auth failures',
      {
        code: 'ITEM_LOGIN_REQUIRED',
        message: 'item login required',
        displayMessage: 'Please reconnect your bank account.',
        retryable: false,
      },
      'auth_reconnect',
      'ITEM_LOGIN_REQUIRED',
    ],
    [
      'provider/system failures',
      {
        code: 'MONO_500',
        message: 'Provider returned 500',
        displayMessage: 'Bank server error. Please try again later.',
        retryable: true,
      },
      'internal_provider_system',
      'MONO_500',
    ],
    [
      'unexpected local failures',
      new Error('System user not found'),
      'internal_provider_system',
      'UNKNOWN_TRANSACTION_SYNC_ERROR',
    ],
  ] as const)('classifies %s', (_name, error, classification, code) => {
    expect(classifyTransactionSyncFailure(error)).toEqual(
      expect.objectContaining({ classification, code }),
    );
  });

  it.each([
    [
      {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'slow down',
        displayMessage: 'Try again later',
        retryable: true,
      },
      true,
    ],
    [
      {
        code: 'INVALID_REQUEST',
        message: 'invalid request',
        displayMessage: 'Invalid request',
        retryable: false,
      },
      false,
    ],
    [new Error('temporary local failure'), true],
  ] as const)('applies retry policy to %#', (error, expected) => {
    expect(isRetryableTransactionSyncFailure(error)).toBe(expected);
  });

  it('marks the connection requires action and emits existing per-account reconnect intents', async () => {
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
      initialTransactionHistoryDays: 730,
      createLinkToken: vi.fn(),
      exchangeToken: vi.fn(),
      getConnectionDetails: vi.fn(),
      supportsTransactionSync: vi.fn(() => true),
      fetchTransactionUpdate: vi.fn(async () => {
        throw authError;
      }),
      handleError: vi.fn((error) => error as ProviderError),
    } as unknown as BankingProvider;
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(fakeProvider);

    const fixture = await createSyncFailureFixture(db);
    const siblingId = await createSiblingBankAccount(db, fixture);

    try {
      await expect(
        transactionSyncService.syncBankAccount({
          bankAccountId: fixture.bankAccountId,
          trigger: 'webhook',
          actorUserId: fixture.userId,
        }),
      ).rejects.toEqual(authError);

      const connection = await db('bank_connections')
        .where({ id: fixture.connectionId })
        .first('authorization_status', 'authorization_reason_code');
      expect(connection).toEqual(
        expect.objectContaining({
          authorization_status: 'requires_action',
          authorization_reason_code: authError.code,
        }),
      );

      const intents = await db('app.outbox')
        .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
        .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
          NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
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
            attentionKey: `bank_account:${fixture.bankAccountId}:reconnect`,
            sourceEntity: {
              type: 'bank_account',
              id: fixture.bankAccountId,
            },
            data: expect.objectContaining({
              bankAccountId: fixture.bankAccountId,
              connectionStatus: 'error',
              syncError: authError.displayMessage,
            }),
          }),
          expect.objectContaining({
            recipientUserId: fixture.userId,
            attentionKey: `bank_account:${siblingId}:reconnect`,
            sourceEntity: {
              type: 'bank_account',
              id: siblingId,
            },
            data: expect.objectContaining({
              bankAccountId: siblingId,
              connectionStatus: 'error',
              syncError: authError.displayMessage,
            }),
          }),
        ]),
      );
      expect(
        intents.some(
          (intent) =>
            intent.payload.event.sourceEntity?.type === 'bank_connection',
        ),
      ).toBe(false);
    } finally {
      await cleanupBankAccountAndFeed(db, siblingId);
      await cleanupSyncFailureFixture(db, fixture);
    }
  });
});
