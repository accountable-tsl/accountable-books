import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import { createHistoryImport } from '../../../../domains/banking/bank-transaction-history/bank-transaction-history.model.js';
import { NOTIFICATION_TYPE } from '../../../../domains/notifications/notifications.types.js';
import { OUTBOX_INTENT } from '../../../../domains/outbox/intents.js';
import { providerRegistry } from '../../providers/registry.js';
import { transactionSyncService } from '../transaction-sync.service.js';
import {
  cleanupSyncFailureFixture,
  createSyncFailureFixture,
  fakeProvider,
  providerTransaction,
} from './transaction-sync.test-helpers.js';

import type { FakeProviderPage } from './transaction-sync.test-helpers.js';

const mocks = vi.hoisted(() => ({
  alertAdmins: vi.fn(async () => undefined),
}));

vi.mock('../../../../features/comms/admin-alerts.js', () => ({
  alertAdmins: mocks.alertAdmins,
}));

afterEach(() => {
  vi.restoreAllMocks();
  mocks.alertAdmins.mockClear();
});

type Fixture = Awaited<ReturnType<typeof createSyncFailureFixture>>;

function singlePage(
  page: Partial<FakeProviderPage['transactions']>,
  options: {
    nextCursor?: string;
    historyStatus?: FakeProviderPage['historyStatus'];
  } = {},
): () => Promise<FakeProviderPage> {
  return async () => ({
    transactions: { added: [], modified: [], removed: [], ...page },
    nextCursor: options.nextCursor ?? `cursor-${randomUUID()}`,
    hasMore: false,
    ...(options.historyStatus ? { historyStatus: options.historyStatus } : {}),
  });
}

async function syncOnce(
  fixture: Fixture,
  page: Partial<FakeProviderPage['transactions']>,
  options: {
    historyStatus?: FakeProviderPage['historyStatus'];
    trigger?: 'initial' | 'periodic' | 'webhook';
  } = {},
) {
  vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
    fakeProvider(singlePage(page, { historyStatus: options.historyStatus })),
  );
  return transactionSyncService.syncBankAccount({
    bankAccountId: fixture.bankAccountId,
    trigger: options.trigger ?? 'webhook',
    actorUserId: fixture.userId,
  });
}

async function setBoundary(fixture: Fixture, ymd: string): Promise<void> {
  const db = getTestDb();
  await db('bank_account_feeds')
    .where({ id: fixture.feedId })
    .update({ sync_from_date: ymd });
}

async function getImportedByProviderId(fixture: Fixture, providerId: string) {
  const db = getTestDb();
  const entry = await db('bank_transaction_feed_entries')
    .where({
      bank_account_feed_id: fixture.feedId,
      provider_transaction_id: providerId,
    })
    .first<{ bank_transaction_id: string }>('bank_transaction_id');
  if (!entry) return null;
  return db('bank_transactions')
    .where({ id: entry.bank_transaction_id })
    .first(
      'id',
      'amount',
      'transaction_date',
      'is_deleted',
      'deletion_reason',
      'superseded_by_bank_transaction_id',
      'source_payload',
      'ledger_transaction_id',
    );
}

async function linkToLedger(
  fixture: Fixture,
  bankTransactionId: string,
): Promise<string> {
  const db = getTestDb();
  return db.transaction(async (trx) => {
    const bankAccount = await trx('bank_accounts')
      .where({ id: fixture.bankAccountId })
      .first<{ coa_id: string; currency_id: string }>('coa_id', 'currency_id');
    if (!bankAccount) throw new Error('bank account missing');

    const offsetCoa = await trx('coa')
      .where({ company_id: fixture.companyId, is_deleted: false })
      .whereNot({ id: bankAccount.coa_id })
      .first<{ id: string }>('id');
    if (!offsetCoa) {
      throw new Error('expected a second COA account for ledger legs');
    }

    const [ledger] = await trx('ledger_transactions')
      .insert({
        company_id: fixture.companyId,
        transaction_date: '2026-01-15',
        transaction_source: 'bank_transaction',
        categorization_source: 'manual',
        source_transaction_id: bankTransactionId,
        source_transaction_date: '2026-01-15',
        source_transaction_amount: 100,
        source_transaction_currency_id: bankAccount.currency_id,
        created_by_id: fixture.userId,
      })
      .returning<{ id: string }[]>('id');

    await trx('ledger_entries').insert([
      {
        company_id: fixture.companyId,
        ledger_transaction_id: ledger.id,
        fs_date: '2026-01-15',
        coa_id: bankAccount.coa_id,
        source_currency_id: bankAccount.currency_id,
        source_amount: -100,
        system_exchange_rate: 1,
        custom_exchange_rate: 1,
        is_bank_leg: true,
        is_monetary: true,
      },
      {
        company_id: fixture.companyId,
        ledger_transaction_id: ledger.id,
        fs_date: '2026-01-15',
        coa_id: offsetCoa.id,
        source_currency_id: bankAccount.currency_id,
        source_amount: 100,
        system_exchange_rate: 1,
        custom_exchange_rate: 1,
        is_bank_leg: false,
        is_monetary: false,
      },
    ]);

    await trx('bank_transactions')
      .where({ id: bankTransactionId })
      .update({ ledger_transaction_id: ledger.id });
    return ledger.id;
  });
}

async function cleanupLedgerAndNotifications(fixture: Fixture): Promise<void> {
  const db = getTestDb();
  await db('app.outbox')
    .whereRaw(`payload->'event'->>'clientCompanyId' = ?`, [fixture.companyId])
    .whereRaw(`payload->'event'->>'eventType' IN (?, ?)`, [
      NOTIFICATION_TYPE.BANK_TRANSACTION_SUPERSEDED_REVIEW,
      NOTIFICATION_TYPE.BANK_TRANSACTION_REMOVED_REVIEW,
    ])
    .delete();
  const bankTxnIds = db('bank_transactions')
    .where({ bank_account_id: fixture.bankAccountId })
    .select('id');
  await db('bank_transactions')
    .where({ bank_account_id: fixture.bankAccountId })
    .update({ ledger_transaction_id: null });
  await db.transaction(async (trx) => {
    await trx.raw("SELECT set_config('app.demo_seed_teardown', 'on', true)");
    const ledgerIds = await trx('ledger_transactions')
      .where({ company_id: fixture.companyId })
      .whereIn('source_transaction_id', bankTxnIds)
      .pluck<string>('id');
    if (ledgerIds.length > 0) {
      await trx('ledger_entries')
        .whereIn('ledger_transaction_id', ledgerIds)
        .delete();
      await trx('ledger_transactions').whereIn('id', ledgerIds).delete();
    }
  });
}

describe('observation classification and routing', () => {
  it('splits a straddling initial download into imports and history candidates', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    await setBoundary(fixture, '2026-01-01');
    const before = {
      ...providerTransaction(fixture.providerBankAccountId, 'hist-old-1'),
      date: '2025-12-15',
    };
    const after = {
      ...providerTransaction(fixture.providerBankAccountId, 'current-1'),
      date: '2026-01-15',
    };

    try {
      const result = await syncOnce(
        fixture,
        { added: [before, after] },
        { historyStatus: 'complete', trigger: 'initial' },
      );
      expect(result).toMatchObject({
        outcome: 'completed',
        added: 2,
        historyStatus: 'complete',
      });

      // On/after the boundary → imported with a feed entry.
      const imported = await getImportedByProviderId(fixture, 'current-1');
      expect(imported).toMatchObject({ is_deleted: false });

      // Before the boundary → quarantined, no feed entry, no bank txn.
      expect(await getImportedByProviderId(fixture, 'hist-old-1')).toBeNull();
      expect(
        await db('bank_transaction_history_candidates')
          .where({
            bank_account_feed_id: fixture.feedId,
            provider_transaction_id: 'hist-old-1',
          })
          .first('amount', 'transaction_date'),
      ).toBeTruthy();

      // Provider reported history complete → import offer is available.
      expect(
        await db('bank_transaction_history_imports')
          .where({ bank_account_feed_id: fixture.feedId })
          .first('status', 'transaction_count'),
      ).toMatchObject({ status: 'available', transaction_count: 1 });

      // The boundary itself never moves during sync.
      expect(
        await db('bank_account_feeds')
          .where({ id: fixture.feedId })
          .first('sync_from_date'),
      ).toMatchObject({ sync_from_date: new Date(2026, 0, 1) });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('stays collecting until the provider reports complete, and supports unavailable', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    await setBoundary(fixture, '2026-01-01');
    const before = {
      ...providerTransaction(fixture.providerBankAccountId, 'hist-old-2'),
      date: '2025-11-01',
    };

    try {
      await syncOnce(fixture, { added: [before] }, { trigger: 'initial' });
      expect(
        await db('bank_transaction_history_imports')
          .where({ bank_account_feed_id: fixture.feedId })
          .first('status'),
      ).toMatchObject({ status: 'collecting' });

      await syncOnce(fixture, {}, { historyStatus: 'unavailable' });
      expect(
        await db('bank_transaction_history_imports')
          .where({ bank_account_feed_id: fixture.feedId })
          .first('status'),
      ).toMatchObject({ status: 'unavailable' });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('does not offer historical import when no older transactions exist', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    await setBoundary(fixture, '2026-01-01');
    await db.transaction((trx) =>
      createHistoryImport({
        bankAccountFeedId: fixture.feedId,
        companyId: fixture.companyId,
        trx,
      }),
    );

    try {
      await syncOnce(
        fixture,
        {
          added: [
            {
              ...providerTransaction(
                fixture.providerBankAccountId,
                'current-only',
              ),
              date: '2026-01-02',
            },
          ],
        },
        { historyStatus: 'complete', trigger: 'initial' },
      );

      const historyImport = await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .first('status', 'transaction_count', 'available_at', 'expires_at');
      expect(historyImport).toMatchObject({
        status: 'unavailable',
        transaction_count: 0,
        available_at: null,
        expires_at: null,
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('discards overlapping history when the account already had manual transactions', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    await setBoundary(fixture, '2026-01-16');
    await db.transaction(async (trx) => {
      await createHistoryImport({
        bankAccountFeedId: fixture.feedId,
        companyId: fixture.companyId,
        trx,
      });
      await trx('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .update({ status: 'unavailable' });
    });

    const overlapping = {
      ...providerTransaction(fixture.providerBankAccountId, 'manual-overlap'),
      date: '2026-01-15',
    };
    const newTransaction = {
      ...providerTransaction(fixture.providerBankAccountId, 'provider-owned'),
      date: '2026-01-16',
    };

    try {
      const result = await syncOnce(
        fixture,
        { added: [overlapping, newTransaction] },
        { historyStatus: 'complete', trigger: 'initial' },
      );

      expect(result.added).toBe(1);
      expect(
        await getImportedByProviderId(fixture, 'manual-overlap'),
      ).toBeNull();
      expect(
        await db('bank_transaction_history_candidates')
          .where({
            bank_account_feed_id: fixture.feedId,
            provider_transaction_id: 'manual-overlap',
          })
          .first('id'),
      ).toBeUndefined();
      expect(
        await getImportedByProviderId(fixture, 'provider-owned'),
      ).toMatchObject({
        is_deleted: false,
      });
      expect(
        await db('bank_transaction_history_imports')
          .where({ bank_account_feed_id: fixture.feedId })
          .first('status', 'transaction_count'),
      ).toMatchObject({ status: 'unavailable', transaction_count: 0 });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('supersedes on a corrected amount, and survives an A→B→A flip-flop', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const original = providerTransaction(
      fixture.providerBankAccountId,
      'corrected-1',
    );

    try {
      await syncOnce(fixture, { added: [original] }, { trigger: 'initial' });
      const first = await getImportedByProviderId(fixture, 'corrected-1');
      expect(first).toMatchObject({ is_deleted: false, amount: '42.0000' });

      // The provider re-observes the same id with a corrected amount (the
      // Mono case sends this as "added"; classification doesn't care).
      const corrected = { ...original, amount: 99 };
      const result = await syncOnce(fixture, { added: [corrected] });
      expect(result.modified).toBe(1);

      const replacement = await getImportedByProviderId(fixture, 'corrected-1');
      expect(replacement).toMatchObject({
        is_deleted: false,
        amount: '99.0000',
      });
      expect(replacement!.id).not.toBe(first!.id);
      expect(
        await db('bank_transactions')
          .where({ id: first!.id })
          .first(
            'is_deleted',
            'deletion_reason',
            'superseded_by_bank_transaction_id',
          ),
      ).toMatchObject({
        is_deleted: true,
        deletion_reason: 'Superseded by provider correction',
        superseded_by_bank_transaction_id: replacement!.id,
      });

      // Flip back to the original amount: another supersede, no
      // duplicate-batch fingerprint collision.
      await syncOnce(fixture, { modified: [original] });
      const third = await getImportedByProviderId(fixture, 'corrected-1');
      expect(third).toMatchObject({ is_deleted: false, amount: '42.0000' });
      expect(third!.id).not.toBe(first!.id);
      expect(third!.id).not.toBe(replacement!.id);
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('refreshes evidence without superseding when only enrichment changed', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const original = providerTransaction(
      fixture.providerBankAccountId,
      'enriched-1',
    );

    try {
      await syncOnce(fixture, { added: [original] }, { trigger: 'initial' });
      const first = await getImportedByProviderId(fixture, 'enriched-1');

      const enriched = {
        ...original,
        merchantName: 'Fancy Merchant',
        category: ['FOOD_AND_DRINK'],
      };
      const result = await syncOnce(fixture, { modified: [enriched] });
      expect(result.modified).toBe(1);

      const same = await getImportedByProviderId(fixture, 'enriched-1');
      expect(same!.id).toBe(first!.id);
      expect(same!.source_payload).toMatchObject({
        merchant_name: 'Fancy Merchant',
        category: ['FOOD_AND_DRINK'],
      });

      // Re-observing identical enrichment is a complete no-op.
      const noop = await syncOnce(fixture, { modified: [enriched] });
      expect(noop.modified).toBe(0);
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('raises a review notification when a ledger-linked transaction is superseded', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const original = providerTransaction(
      fixture.providerBankAccountId,
      'posted-corrected-1',
    );

    try {
      await syncOnce(fixture, { added: [original] }, { trigger: 'initial' });
      const first = await getImportedByProviderId(
        fixture,
        'posted-corrected-1',
      );
      const ledgerId = await linkToLedger(fixture, first!.id);

      await syncOnce(fixture, { modified: [{ ...original, amount: 77 }] });

      const replacement = await getImportedByProviderId(
        fixture,
        'posted-corrected-1',
      );
      expect(replacement).toMatchObject({
        amount: '77.0000',
        ledger_transaction_id: null, // replacement lands in the inbox uncategorized
      });
      // The ledger transaction itself is untouched.
      expect(
        await db('ledger_transactions').where({ id: ledgerId }).first('status'),
      ).toMatchObject({ status: 'posted' });

      const intents = await db('app.outbox')
        .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
        .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
          NOTIFICATION_TYPE.BANK_TRANSACTION_SUPERSEDED_REVIEW,
        ])
        .andWhereRaw(`payload->'event'->>'attentionKey' = ?`, [
          `bank_transaction:${first!.id}:provider_superseded`,
        ]);
      expect(intents.length).toBeGreaterThan(0);
    } finally {
      await cleanupLedgerAndNotifications(fixture);
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('splits removals: soft-delete unlinked, keep ledger-linked with a notification, drop candidates', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    await setBoundary(fixture, '2026-01-01');
    const unlinked = providerTransaction(
      fixture.providerBankAccountId,
      'removable-1',
    );
    const posted = providerTransaction(
      fixture.providerBankAccountId,
      'posted-removable-1',
    );
    const historical = {
      ...providerTransaction(fixture.providerBankAccountId, 'hist-removable-1'),
      date: '2025-10-05',
    };

    try {
      await syncOnce(
        fixture,
        { added: [unlinked, posted, historical] },
        { trigger: 'initial' },
      );
      const postedRow = await getImportedByProviderId(
        fixture,
        'posted-removable-1',
      );
      await linkToLedger(fixture, postedRow!.id);

      const result = await syncOnce(fixture, {
        removed: [
          'removable-1',
          'posted-removable-1',
          'hist-removable-1',
          'never-seen-1',
        ],
      });
      expect(result.removed).toBe(3); // unknown id is a no-op

      expect(
        await getImportedByProviderId(fixture, 'removable-1'),
      ).toMatchObject({
        is_deleted: true,
        deletion_reason: 'Removed by bank feed provider',
      });

      // Ledger-linked: kept visible for audit, review notification raised.
      expect(
        await getImportedByProviderId(fixture, 'posted-removable-1'),
      ).toMatchObject({ is_deleted: false });
      const intents = await db('app.outbox')
        .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
        .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
          NOTIFICATION_TYPE.BANK_TRANSACTION_REMOVED_REVIEW,
        ])
        .andWhereRaw(`payload->'event'->>'attentionKey' = ?`, [
          `bank_transaction:${postedRow!.id}:provider_removed`,
        ]);
      expect(intents.length).toBeGreaterThan(0);

      // Candidate removal shrinks the quarantine and its aggregates.
      expect(
        await db('bank_transaction_history_candidates')
          .where({
            bank_account_feed_id: fixture.feedId,
            provider_transaction_id: 'hist-removable-1',
          })
          .first('id'),
      ).toBeUndefined();
      expect(
        await db('bank_transaction_history_imports')
          .where({ bank_account_feed_id: fixture.feedId })
          .first('transaction_count'),
      ).toMatchObject({ transaction_count: 0 });
    } finally {
      await cleanupLedgerAndNotifications(fixture);
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('re-routes material corrections across the starting-date boundary in both directions', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    await setBoundary(fixture, '2026-01-01');
    const historical = {
      ...providerTransaction(fixture.providerBankAccountId, 'crosser-up'),
      date: '2025-12-20',
    };
    const current = {
      ...providerTransaction(fixture.providerBankAccountId, 'crosser-down'),
      date: '2026-01-20',
    };

    try {
      await syncOnce(
        fixture,
        { added: [historical, current] },
        { trigger: 'initial' },
      );
      const importedCurrent = await getImportedByProviderId(
        fixture,
        'crosser-down',
      );
      expect(importedCurrent).toMatchObject({ is_deleted: false });

      // Candidate corrected to a date on/after the boundary → inbox.
      await syncOnce(fixture, {
        modified: [{ ...historical, date: '2026-01-05' }],
      });
      expect(
        await db('bank_transaction_history_candidates')
          .where({
            bank_account_feed_id: fixture.feedId,
            provider_transaction_id: 'crosser-up',
          })
          .first('id'),
      ).toBeUndefined();
      expect(
        await getImportedByProviderId(fixture, 'crosser-up'),
      ).toMatchObject({ is_deleted: false });

      // Imported transaction corrected to before the boundary → retired,
      // mapping removed, replacement quarantined.
      await syncOnce(fixture, {
        modified: [{ ...current, date: '2025-12-01' }],
      });
      expect(await getImportedByProviderId(fixture, 'crosser-down')).toBeNull(); // feed entry deleted
      expect(
        await db('bank_transactions')
          .where({ id: importedCurrent!.id })
          .first('is_deleted', 'superseded_by_bank_transaction_id'),
      ).toMatchObject({
        is_deleted: true,
        superseded_by_bank_transaction_id: null,
      });
      expect(
        await db('bank_transaction_history_candidates')
          .where({
            bank_account_feed_id: fixture.feedId,
            provider_transaction_id: 'crosser-down',
          })
          .first('transaction_date', 'supersedes_bank_transaction_id'),
      ).toMatchObject({
        transaction_date: new Date(2025, 11, 1),
        supersedes_bank_transaction_id: importedCurrent!.id,
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('restores a provider-removed transaction when it reappears', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    await setBoundary(fixture, '2026-01-01');
    const txn = {
      ...providerTransaction(fixture.providerBankAccountId, 'reappear-1'),
      amount: 12.5,
      date: '2026-01-10',
    };

    try {
      await syncOnce(fixture, { added: [txn] });
      const imported = await getImportedByProviderId(fixture, 'reappear-1');
      expect(imported).toMatchObject({ is_deleted: false });

      await syncOnce(fixture, { removed: ['reappear-1'] });
      expect(
        await db('bank_transactions')
          .where({ id: imported!.id })
          .first('is_deleted', 'deletion_origin'),
      ).toMatchObject({
        is_deleted: true,
        deletion_origin: 'provider_sync',
      });

      await syncOnce(fixture, {
        added: [{ ...txn, amount: 12.5, date: '2026-01-10' }],
      });
      expect(
        await db('bank_transactions')
          .where({ id: imported!.id })
          .first('is_deleted', 'deletion_origin', 'amount'),
      ).toMatchObject({
        is_deleted: false,
        deletion_origin: null,
        amount: '12.5000',
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('adopts predecessor transactions on a replacement feed without duplicating', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    let newConnectionId: string | undefined;

    try {
      const original = providerTransaction(
        fixture.providerBankAccountId,
        `orig-${randomUUID()}`,
      );
      await syncOnce(
        fixture,
        { added: [original] },
        { historyStatus: 'complete', trigger: 'initial' },
      );
      const originalRow = await getImportedByProviderId(
        fixture,
        original.transactionId,
      );
      expect(originalRow).toBeTruthy();
      const ledgerId = await linkToLedger(fixture, originalRow!.id);

      await db('bank_account_feeds')
        .where({ id: fixture.feedId })
        .update({
          sync_from_date: '2026-01-01',
          last_successful_sync_at: new Date('2026-01-20T00:00:00Z'),
          revoked_at: db.fn.now(),
          revocation_origin: 'client',
          revocation_reason: 'replaced',
        });

      const [newConnection] = await db('bank_connections')
        .insert({
          company_id: fixture.companyId,
          provider_id: (await db('bank_connections')
            .where({ id: fixture.connectionId })
            .first('provider_id'))!.provider_id,
          provider_item_id: `item-replacement-${randomUUID()}`,
          authorization_status: 'active',
          connected_by_id: fixture.userId,
        })
        .returning('id');
      newConnectionId = newConnection.id as string;
      const { encrypt } = await import(
        '../../../../shared/utils/crypto.utils.js'
      );
      await db('bank_connection_secrets').insert({
        bank_connection_id: newConnection.id,
        encrypted_access_token: encrypt(
          `access-${randomUUID()}`,
          `${newConnection.id}:${fixture.companyId}`,
        ),
        encryption_key_version: 1,
      });
      const newProviderAccountId = `provider-account-${randomUUID()}`;
      const [newFeed] = await db('bank_account_feeds')
        .insert({
          company_id: fixture.companyId,
          bank_account_id: fixture.bankAccountId,
          bank_connection_id: newConnection.id,
          provider_account_id: newProviderAccountId,
          sync_from_timezone: 'Etc/UTC',
          sync_from_date: '2026-01-01',
          connected_by_id: fixture.userId,
          replaces_bank_account_feed_id: fixture.feedId,
        })
        .returning('id');

      const matching = {
        ...providerTransaction(newProviderAccountId, `new-${randomUUID()}`),
        date: original.date,
        amount: original.amount,
      };
      const unmatched = {
        ...providerTransaction(
          newProviderAccountId,
          `unmatched-${randomUUID()}`,
        ),
        date: '2026-01-16',
        amount: 99,
      };
      const outside = {
        ...providerTransaction(newProviderAccountId, `outside-${randomUUID()}`),
        // After predecessor last sync, still in the new feed accepted window.
        date: '2026-01-25',
        amount: 7,
      };

      vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
        fakeProvider(
          singlePage(
            { added: [matching, unmatched, outside] },
            { historyStatus: 'complete' },
          ),
        ),
      );
      await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'initial',
        actorUserId: fixture.userId,
      });

      const adoptedEntry = await db('bank_transaction_feed_entries')
        .where({
          bank_account_feed_id: newFeed.id,
          provider_transaction_id: matching.transactionId,
        })
        .first(
          'bank_transaction_id',
          'adopted_from_feed_entry_id',
          'replacement_unmatched',
        );
      expect(adoptedEntry).toMatchObject({
        bank_transaction_id: originalRow!.id,
        replacement_unmatched: false,
      });
      expect(adoptedEntry!.adopted_from_feed_entry_id).toBeTruthy();

      expect(
        await db('bank_transactions')
          .where({ id: originalRow!.id })
          .first('ledger_transaction_id'),
      ).toMatchObject({ ledger_transaction_id: ledgerId });

      const unmatchedEntry = await db('bank_transaction_feed_entries')
        .where({
          bank_account_feed_id: newFeed.id,
          provider_transaction_id: unmatched.transactionId,
        })
        .first('replacement_unmatched', 'bank_transaction_id');
      expect(unmatchedEntry).toMatchObject({ replacement_unmatched: true });
      expect(unmatchedEntry!.bank_transaction_id).not.toBe(originalRow!.id);

      const outsideEntry = await db('bank_transaction_feed_entries')
        .where({
          bank_account_feed_id: newFeed.id,
          provider_transaction_id: outside.transactionId,
        })
        .first('replacement_unmatched');
      expect(outsideEntry).toMatchObject({ replacement_unmatched: false });

      const canonicalCount = await db('bank_transactions')
        .where({ bank_account_id: fixture.bankAccountId, is_deleted: false })
        .count<{ count: string }>('id as count')
        .first();
      // original + unmatched + outside (adopted reuses original)
      expect(canonicalCount?.count).toBe('3');

      const feedAfter = await db('bank_account_feeds')
        .where({ id: newFeed.id })
        .first('replacement_reconciliation_completed_at');
      expect(feedAfter?.replacement_reconciliation_completed_at).toBeTruthy();

      const reviewIntent = await db('app.outbox')
        .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
        .whereRaw(`payload->'event'->>'eventType' = ?`, [
          NOTIFICATION_TYPE.BANK_REPLACEMENT_UNMATCHED_REVIEW,
        ])
        .first();
      expect(reviewIntent).toBeTruthy();

      // Re-sync must not re-run predecessor matching after complete marker.
      vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
        fakeProvider(
          singlePage(
            {
              added: [
                {
                  ...matching,
                  transactionId: `replay-${randomUUID()}`,
                  date: original.date,
                  amount: original.amount,
                },
              ],
            },
            { historyStatus: 'complete' },
          ),
        ),
      );
      await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'webhook',
        actorUserId: fixture.userId,
      });
      const afterReplay = await db('bank_transactions')
        .where({ bank_account_id: fixture.bankAccountId, is_deleted: false })
        .count<{ count: string }>('id as count')
        .first();
      // Extra import (no adopt) because reconciliation already completed.
      expect(afterReplay?.count).toBe('4');
    } finally {
      await cleanupSyncFailureFixture(
        db,
        fixture,
        newConnectionId ? [newConnectionId] : [],
      );
    }
  });
});
