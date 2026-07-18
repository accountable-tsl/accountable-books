import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  NG_USER_EMAIL,
  US_USER_EMAIL,
} from '../../../../../test/helpers.js';
import { notify } from '../../../notifications/notifications.model.js';
import { NOTIFICATION_TYPE } from '../../../notifications/notifications.types.js';
import { OUTBOX_INTENT } from '../../../outbox/intents.js';
import { deriveAccountNumberIdentity } from '../../account-identity.js';
import { createBankAccountFeed } from '../../bank-account-feeds/bank-account-feeds.model.js';
import { createBankConnection } from '../../bank-connections/bank-connections.model.js';
import {
  buildBankReconnectAttentionKey,
  buildBankSyncFailureAttentionKey,
  writeBankReconnectNotificationLifecycle,
  writeBankSyncFailureRequiresActionNotifications,
  writeBankSyncFailureResolvedNotifications,
} from '../bankAccountNotifications.js';
import {
  createBankAccountWithConnection,
  createManualBankAccount,
  getBankAccountSyncEligibility,
  getSyncableBankAccounts,
} from '../bankAccounts.model.js';

describe('bank account creation', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;
  let bankId: string;
  let reportingCurrencyId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);

    const [bank, company] = await Promise.all([
      trx('banks').select('id').first<{ id: string }>(),
      trx('companies')
        .where({ id: companyId })
        .first<{ reporting_currency_id: string }>('reporting_currency_id'),
    ]);

    if (!bank || !company?.reporting_currency_id) {
      throw new Error('Expected test bank and company reporting currency');
    }

    bankId = bank.id;
    reportingCurrencyId = company.reporting_currency_id;
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('creates and links a reporting-currency COA for a foreign-currency bank account', async () => {
    const accountNumber = randomUUID();
    const coaName = `Foreign bank COA ${randomUUID()}`;
    const bankCurrencyId = await getCurrencyId(trx, 'GBP');

    const result = await createManualBankAccount({
      trx,
      companyId,
      userId,
      params: {
        displayName: `Foreign bank ${randomUUID()}`,
        accountNumber,
        accountType: 'checkings_current',
        businessOrPersonal: 'business',
        bankId,
        currencyId: bankCurrencyId,
        coaName,
      },
    });

    expect(result.success).toBe(true);

    const bankAccount = await trx('bank_accounts')
      .where({ id: result.data!.bankAccountId })
      .first<{ coa_id: string; currency_id: string }>('coa_id', 'currency_id');
    const coa = await trx('coa')
      .where({ id: result.data!.coaId })
      .first<{ currency_id: string; name: string }>('currency_id', 'name');
    const currentVersion = await trx('coa_versions')
      .where({ coa_id: result.data!.coaId })
      .whereNull('effective_to')
      .first<{ version_seq: number }>('version_seq');

    expect(bankAccount).toEqual({
      coa_id: result.data!.coaId,
      currency_id: bankCurrencyId,
    });
    expect(coa).toEqual({
      currency_id: reportingCurrencyId,
      name: coaName,
    });
    expect(currentVersion?.version_seq).toBe(1);
  });

  it('rolls back the associated COA when bank-account insertion fails', async () => {
    const coaName = `Duplicate bank COA ${randomUUID()}`;
    // Seed the name conflict in its own committed transaction. Creating it
    // on the still-open outer `trx` would leave an uncommitted conflicting
    // row that the second (separately-transacted) insert below would block
    // on indefinitely, since Postgres blocks a unique check against a
    // concurrent, not-yet-resolved transaction rather than failing fast.
    const accountTypeBank = await trx('account_types')
      .where('key', 'ca_bank')
      .first<{ id: string }>('id');
    if (!accountTypeBank) throw new Error('account_types.ca_bank not found');
    const seedTrx = await getTestDb().transaction();
    let seedCoaId: string;
    try {
      const [seeded] = await seedTrx('coa')
        .insert({
          company_id: companyId,
          account_type_id: accountTypeBank.id,
          currency_id: reportingCurrencyId,
          name: coaName,
          code: `dup-${randomUUID()}`,
          created_by_id: userId,
        })
        .returning<{ id: string }[]>('id');
      seedCoaId = seeded.id;
      await seedTrx.commit();
    } catch (error) {
      await seedTrx.rollback();
      throw error;
    }

    try {
      const before = await countCompanyRows(trx, companyId);

      // The connect-path schema has no coa_name field: its COA name always
      // defaults to displayName, so reusing the first COA's name here
      // reproduces the same uniqueness conflict. Deliberately omit `trx` so
      // the failure runs in its own transaction and rolls back on its own
      // (Postgres rolls back a commit attempted against an aborted
      // transaction), leaving the outer test transaction usable afterward.
      const result = await createBankAccountWithConnection({
        companyId,
        userId,
        params: {
          displayName: coaName,
          accountNumber: randomUUID(),
          accountType: 'checkings_current',
          businessOrPersonal: 'business',
          bankId,
          currencyCode: 'USD',
        },
      });

      expect(result.success).toBe(false);
      expect(await countCompanyRows(trx, companyId)).toEqual(before);
    } finally {
      await getTestDb()('coa').where({ id: seedCoaId }).delete();
    }
  });

  it('reuses the same bank account on a repeat manual create with the same account number', async () => {
    const accountNumber = randomUUID();
    const first = await createManualBankAccount({
      trx,
      companyId,
      userId,
      params: {
        displayName: `Reused bank ${randomUUID()}`,
        accountNumber,
        accountType: 'checkings_current',
        businessOrPersonal: 'business',
        bankId,
        currencyId: reportingCurrencyId,
      },
    });
    expect(first.success).toBe(true);
    expect(first.data?.wasUpdated).toBe(false);

    const second = await createManualBankAccount({
      trx,
      companyId,
      userId,
      params: {
        displayName: `Reused bank renamed ${randomUUID()}`,
        accountNumber,
        accountType: 'savings',
        businessOrPersonal: 'business',
        bankId,
        currencyId: reportingCurrencyId,
      },
    });

    expect(second.success).toBe(true);
    expect(second.data?.wasUpdated).toBe(true);
    expect(second.data?.bankAccountId).toBe(first.data?.bankAccountId);
    expect(second.data?.coaId).toBe(first.data?.coaId);

    const identity = deriveAccountNumberIdentity(accountNumber);
    const stored = await trx('bank_accounts')
      .where({ id: first.data!.bankAccountId })
      .first<{
        account_number_fingerprint: string;
        account_number_mask: string;
        account_type: string;
      }>('account_number_fingerprint', 'account_number_mask', 'account_type');
    expect(stored).toEqual({
      account_number_fingerprint: identity.account_number_fingerprint,
      account_number_mask: identity.account_number_mask,
      account_type: 'savings',
    });
  });

  it('never matches an existing account by mask alone when no account number is supplied', async () => {
    const accountNumber = randomUUID();
    const manual = await createManualBankAccount({
      trx,
      companyId,
      userId,
      params: {
        displayName: `Mask source bank ${randomUUID()}`,
        // Distinct explicit code: both accounts below share a mask, and the
        // connect path (with no coa_code field) would otherwise derive the
        // same `**mask` COA code for both, colliding on an unrelated
        // uniqueness constraint instead of exercising identity matching.
        coaCode: `mask-src-${randomUUID()}`,
        accountNumber,
        accountType: 'checkings_current',
        businessOrPersonal: 'business',
        bankId,
        currencyId: reportingCurrencyId,
      },
    });
    expect(manual.success).toBe(true);
    const sharedMask =
      deriveAccountNumberIdentity(accountNumber).account_number_mask;

    const connectResult = await createBankAccountWithConnection({
      trx,
      companyId,
      userId,
      params: {
        displayName: `Connect without account number ${randomUUID()}`,
        accountNumberMask: sharedMask,
        accountType: 'checkings_current',
        businessOrPersonal: 'business',
        bankId,
        currencyCode: 'USD',
      },
    });

    expect(connectResult.success).toBe(true);
    expect(connectResult.data?.wasUpdated).toBe(false);
    expect(connectResult.data?.bankAccountId).not.toBe(
      manual.data?.bankAccountId,
    );

    const rows = await trx('bank_accounts')
      .where({ company_id: companyId, bank_id: bankId })
      .whereIn('id', [
        manual.data!.bankAccountId,
        connectResult.data!.bankAccountId,
      ])
      .select('id', 'account_number_mask', 'account_number_fingerprint');
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.account_number_mask === sharedMask)).toBe(
      true,
    );
    const withoutFingerprint = rows.find(
      (row) => row.id === connectResult.data!.bankAccountId,
    );
    expect(withoutFingerprint?.account_number_fingerprint).toBeNull();
  });

  it('creates a connect-path bank account and binds it to a connection and feed', async () => {
    const provider = await trx('bank_feed_providers')
      .select('id')
      .first<{ id: string }>();
    if (!provider) throw new Error('Expected a bank feed provider fixture');

    const connectionResult = await createBankConnection({
      data: {
        company_id: companyId,
        provider_id: provider.id,
        connected_by_id: userId,
      },
      trx,
    });
    expect(connectionResult.success).toBe(true);
    const connectionId = connectionResult.data!.id;

    const accountResult = await createBankAccountWithConnection({
      trx,
      companyId,
      userId,
      params: {
        displayName: `Connected bank ${randomUUID()}`,
        accountNumber: randomUUID(),
        accountNumberMask: '1234',
        accountType: 'checkings_current',
        businessOrPersonal: 'business',
        bankId,
        currencyCode: 'USD',
      },
    });
    expect(accountResult.success).toBe(true);
    const bankAccountId = accountResult.data!.bankAccountId;

    const feedResult = await createBankAccountFeed({
      data: {
        company_id: companyId,
        bank_account_id: bankAccountId,
        bank_connection_id: connectionId,
        provider_account_id: `provider-account-${randomUUID()}`,
        sync_from_timezone: 'Etc/UTC',
        connected_by_id: userId,
      },
      trx,
    });
    expect(feedResult.success).toBe(true);

    expect(
      await getSyncableBankAccounts({ bankAccountId, companyId }, trx),
    ).toEqual([
      expect.objectContaining({
        id: bankAccountId,
        bank_connection_id: connectionId,
      }),
    ]);
    expect(
      await getBankAccountSyncEligibility({ bankAccountId, companyId }, trx),
    ).toEqual({ id: bankAccountId, eligible: true, reason: null });
  });

  it('excludes accounts without an active, authorized feed from sync scans', async () => {
    const account = await createConnectedBankAccountFixture(trx, {
      companyId,
      userId,
      bankId,
    });

    expect(
      await getSyncableBankAccounts(
        { bankAccountId: account.id, companyId },
        trx,
      ),
    ).toEqual([
      expect.objectContaining({
        id: account.id,
        bank_connection_id: account.connectionId,
        bank_account_feed_id: account.feedId,
      }),
    ]);
    expect(
      await getBankAccountSyncEligibility(
        { bankAccountId: account.id, companyId },
        trx,
      ),
    ).toEqual({ id: account.id, eligible: true, reason: null });

    await trx('bank_connections').where({ id: account.connectionId }).update({
      authorization_status: 'requires_action',
      requires_action_at: trx.fn.now(),
    });
    expect(
      await getSyncableBankAccounts(
        { bankAccountId: account.id, companyId },
        trx,
      ),
    ).toEqual([]);
    expect(
      await getBankAccountSyncEligibility(
        { bankAccountId: account.id, companyId },
        trx,
      ),
    ).toEqual({
      id: account.id,
      eligible: false,
      reason: 'reconnect_required',
    });

    await trx('bank_connections').where({ id: account.connectionId }).update({
      authorization_status: 'active',
      requires_action_at: null,
    });
    await trx('bank_account_feeds').where({ id: account.feedId }).update({
      revoked_at: trx.fn.now(),
      revocation_origin: 'client',
    });
    expect(
      await getSyncableBankAccounts(
        { bankAccountId: account.id, companyId },
        trx,
      ),
    ).toEqual([]);
    expect(
      await getBankAccountSyncEligibility(
        { bankAccountId: account.id, companyId },
        trx,
      ),
    ).toEqual({
      id: account.id,
      eligible: false,
      reason: 'not_connected',
    });

    await trx('bank_accounts').where({ id: account.id }).update({
      is_deleted: true,
      deleted_at: trx.fn.now(),
    });
    expect(
      await getSyncableBankAccounts(
        { bankAccountId: account.id, companyId },
        trx,
      ),
    ).toEqual([]);
    expect(
      await getBankAccountSyncEligibility(
        { bankAccountId: account.id, companyId },
        trx,
      ),
    ).toBeNull();
  });

  it('opens the existing per-account reconnect notifications when projected connection status becomes error', async () => {
    const firmAssigneeId = await getTestUserId(trx, NG_USER_EMAIL);
    await ensureClientOwnerRole(trx, {
      companyId,
      userId,
      actorUserId: userId,
    });
    await replaceClientAssignee(trx, {
      clientCompanyId: companyId,
      firmStaffUserId: firmAssigneeId,
      actorUserId: userId,
    });

    const bankAccount = await createConnectedBankAccountFixture(trx, {
      companyId,
      userId,
      bankId,
    });

    const intentCount = await writeBankReconnectNotificationLifecycle(trx, {
      bankAccountId: bankAccount.id,
      clientCompanyId: companyId,
      previousConnectionStatus: 'connected',
      nextConnectionStatus: 'error',
      bankAccountName: bankAccount.displayName,
      syncError: 'Please reconnect your bank account.',
      stateVersion: '2026-06-21T00:00:00.000Z',
    });
    expect(intentCount).toBe(2);

    const firmCompanyId = await resolveFirmCompanyId(trx, companyId);
    const attentionKey = buildBankReconnectAttentionKey(bankAccount.id);
    const intents = await trx('app.outbox')
      .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
      .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
        NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
      ])
      .andWhereRaw(`payload->'event'->>'attentionKey' = ?`, [attentionKey])
      .orderBy('id', 'asc');

    expect(intents).toHaveLength(2);
    const events = intents.map((intent) => intent.payload.event);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientUserId: userId,
          clientCompanyId: companyId,
          policyOwnerCompanyId: companyId,
          eventType: NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
          attentionKey,
          attentionTransition: 'opened',
          priority: 'high',
          readPolicy: 'explicit',
          sourceEntity: { type: 'bank_account', id: bankAccount.id },
          destination: expect.objectContaining({
            action: 'reconnect_bank_account',
            bankAccountId: bankAccount.id,
          }),
          data: expect.objectContaining({
            bankAccountId: bankAccount.id,
            connectionStatus: 'error',
            syncError: 'Please reconnect your bank account.',
          }),
        }),
        expect.objectContaining({
          recipientUserId: firmAssigneeId,
          clientCompanyId: companyId,
          policyOwnerCompanyId: firmCompanyId,
          eventType: NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
          attentionKey,
          attentionTransition: 'opened',
        }),
      ]),
    );
  });

  it('resolves the existing per-account reconnect notifications when projected status returns to connected', async () => {
    const firmAssigneeId = await getTestUserId(trx, NG_USER_EMAIL);
    await ensureClientOwnerRole(trx, {
      companyId,
      userId,
      actorUserId: userId,
    });
    await replaceClientAssignee(trx, {
      clientCompanyId: companyId,
      firmStaffUserId: firmAssigneeId,
      actorUserId: userId,
    });

    const bankAccount = await createConnectedBankAccountFixture(trx, {
      companyId,
      userId,
      bankId,
    });
    await writeBankReconnectNotificationLifecycle(trx, {
      bankAccountId: bankAccount.id,
      clientCompanyId: companyId,
      previousConnectionStatus: 'connected',
      nextConnectionStatus: 'error',
      bankAccountName: bankAccount.displayName,
      syncError: 'Please reconnect your bank account.',
      stateVersion: '2026-06-21T00:00:00.000Z',
    });

    const resolvedCount = await writeBankReconnectNotificationLifecycle(trx, {
      bankAccountId: bankAccount.id,
      clientCompanyId: companyId,
      previousConnectionStatus: 'error',
      nextConnectionStatus: 'connected',
      bankAccountName: bankAccount.displayName,
      previousSyncError: 'Please reconnect your bank account.',
      stateVersion: '2026-06-21T01:00:00.000Z',
    });
    expect(resolvedCount).toBe(2);

    const attentionKey = buildBankReconnectAttentionKey(bankAccount.id);
    const resolutionIntents = await trx('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
      })
      .andWhereRaw(`payload->>'attentionKey' = ?`, [attentionKey])
      .orderBy('id', 'asc');

    expect(resolutionIntents).toHaveLength(2);
    expect(resolutionIntents.map((intent) => intent.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientUserId: userId,
          attentionKey,
          companyId,
        }),
        expect.objectContaining({
          recipientUserId: firmAssigneeId,
          attentionKey,
          companyId,
        }),
      ]),
    );
    for (const intent of resolutionIntents) {
      expect(String(intent.payload.idempotencyKey)).toContain('resolved');
      expect(String(intent.payload.idempotencyKey)).toContain(bankAccount.id);
    }
  });

  it('emits an existing per-account reconnect material update when the sync error changes', async () => {
    const firmAssigneeId = await getTestUserId(trx, NG_USER_EMAIL);
    await ensureClientOwnerRole(trx, {
      companyId,
      userId,
      actorUserId: userId,
    });
    await replaceClientAssignee(trx, {
      clientCompanyId: companyId,
      firmStaffUserId: firmAssigneeId,
      actorUserId: userId,
    });

    const bankAccount = await createConnectedBankAccountFixture(trx, {
      companyId,
      userId,
      bankId,
    });

    const intentCount = await writeBankReconnectNotificationLifecycle(trx, {
      bankAccountId: bankAccount.id,
      clientCompanyId: companyId,
      previousConnectionStatus: 'error',
      nextConnectionStatus: 'error',
      bankAccountName: bankAccount.displayName,
      previousSyncError: 'Previous auth error',
      syncError: 'Latest auth error',
      stateVersion: '2026-06-21T00:00:00.000Z',
    });

    expect(intentCount).toBe(2);
    const attentionKey = buildBankReconnectAttentionKey(bankAccount.id);
    const events = await trx('app.outbox')
      .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
      .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
        NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
      ])
      .andWhereRaw(`payload->'event'->>'attentionKey' = ?`, [attentionKey])
      .andWhereRaw(`payload->'event'->>'attentionTransition' = ?`, [
        'material_update',
      ])
      .then((intents) => intents.map((intent) => intent.payload.event));

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientUserId: userId,
          attentionKey,
          attentionTransition: 'material_update',
          data: expect.objectContaining({
            syncError: 'Latest auth error',
          }),
        }),
        expect.objectContaining({
          recipientUserId: firmAssigneeId,
          attentionKey,
          attentionTransition: 'material_update',
        }),
      ]),
    );
  });

  it('does not open reconnect attention when projected status becomes revoked', async () => {
    const firmAssigneeId = await getTestUserId(trx, NG_USER_EMAIL);
    await ensureClientOwnerRole(trx, {
      companyId,
      userId,
      actorUserId: userId,
    });
    await replaceClientAssignee(trx, {
      clientCompanyId: companyId,
      firmStaffUserId: firmAssigneeId,
      actorUserId: userId,
    });

    const bankAccount = await createConnectedBankAccountFixture(trx, {
      companyId,
      userId,
      bankId,
    });

    const intentCount = await writeBankReconnectNotificationLifecycle(trx, {
      bankAccountId: bankAccount.id,
      clientCompanyId: companyId,
      previousConnectionStatus: 'connected',
      nextConnectionStatus: 'revoked',
      bankAccountName: bankAccount.displayName,
      syncError: 'Credential revoked',
      stateVersion: '2026-06-21T00:00:00.000Z',
    });
    expect(intentCount).toBe(0);

    const attentionKey = buildBankReconnectAttentionKey(bankAccount.id);
    const openedIntents = await trx('app.outbox')
      .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
      .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
        NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
      ])
      .andWhereRaw(`payload->'event'->>'attentionKey' = ?`, [attentionKey]);
    expect(openedIntents).toHaveLength(0);
  });

  it('resolves open reconnect attention when projected status becomes revoked', async () => {
    const firmAssigneeId = await getTestUserId(trx, NG_USER_EMAIL);
    await ensureClientOwnerRole(trx, {
      companyId,
      userId,
      actorUserId: userId,
    });
    await replaceClientAssignee(trx, {
      clientCompanyId: companyId,
      firmStaffUserId: firmAssigneeId,
      actorUserId: userId,
    });

    const bankAccount = await createConnectedBankAccountFixture(trx, {
      companyId,
      userId,
      bankId,
    });

    await writeBankReconnectNotificationLifecycle(trx, {
      bankAccountId: bankAccount.id,
      clientCompanyId: companyId,
      previousConnectionStatus: 'connected',
      nextConnectionStatus: 'error',
      bankAccountName: bankAccount.displayName,
      syncError: 'Please reconnect your bank account.',
      stateVersion: '2026-06-21T00:00:00.000Z',
    });

    const resolvedCount = await writeBankReconnectNotificationLifecycle(trx, {
      bankAccountId: bankAccount.id,
      clientCompanyId: companyId,
      previousConnectionStatus: 'error',
      nextConnectionStatus: 'revoked',
      bankAccountName: bankAccount.displayName,
      previousSyncError: 'Please reconnect your bank account.',
      stateVersion: '2026-06-21T00:00:01.000Z',
    });
    expect(resolvedCount).toBe(2);

    const attentionKey = buildBankReconnectAttentionKey(bankAccount.id);
    const resolvedIntents = await trx('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
      })
      .andWhereRaw(`payload->>'attentionKey' = ?`, [attentionKey]);
    expect(resolvedIntents).toHaveLength(2);
  });

  it('opens sync failure notifications for firm assignee when transaction import partially fails', async () => {
    const firmAssigneeId = await getTestUserId(trx, NG_USER_EMAIL);
    await ensureClientOwnerRole(trx, {
      companyId,
      userId,
      actorUserId: userId,
    });
    await replaceClientAssignee(trx, {
      clientCompanyId: companyId,
      firmStaffUserId: firmAssigneeId,
      actorUserId: userId,
    });

    const bankAccount = await createConnectedBankAccountFixture(trx, {
      companyId,
      userId,
      bankId,
    });
    const firmCompanyId = await resolveFirmCompanyId(trx, companyId);

    const intentCount = await writeBankSyncFailureRequiresActionNotifications(
      trx,
      {
        clientCompanyId: companyId,
        connectionId: bankAccount.connectionId,
        failures: [
          {
            bankAccountId: bankAccount.id,
            error: 'Missing required transaction field',
            failedTransactionCount: 4,
          },
        ],
        stateVersion: '2026-06-21T00:00:00.000Z',
      },
    );

    expect(intentCount).toBe(1);
    const [intent] = await trx('app.outbox')
      .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
      .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
        NOTIFICATION_TYPE.SYNC_FAILURE_REQUIRES_ACTION,
      ]);

    expect(intent?.payload.event).toEqual(
      expect.objectContaining({
        recipientUserId: firmAssigneeId,
        firmCompanyId,
        clientCompanyId: companyId,
        policyOwnerCompanyId: firmCompanyId,
        eventType: NOTIFICATION_TYPE.SYNC_FAILURE_REQUIRES_ACTION,
        attentionKey: buildBankSyncFailureAttentionKey(bankAccount.id),
        priority: 'high',
        readPolicy: 'explicit',
        sourceEntity: { type: 'bank_account', id: bankAccount.id },
        data: expect.objectContaining({
          bankAccountId: bankAccount.id,
          bankAccountName: bankAccount.displayName,
          connectionId: bankAccount.connectionId,
          failedBatchCount: 1,
          failedTransactionCount: 4,
          errors: ['Missing required transaction field'],
        }),
      }),
    );
  });

  it('resolves active sync failure notifications after a clean transaction sync', async () => {
    const firmAssigneeId = await getTestUserId(trx, NG_USER_EMAIL);
    await replaceClientAssignee(trx, {
      clientCompanyId: companyId,
      firmStaffUserId: firmAssigneeId,
      actorUserId: userId,
    });

    const bankAccount = await createConnectedBankAccountFixture(trx, {
      companyId,
      userId,
      bankId,
    });
    const firmCompanyId = await resolveFirmCompanyId(trx, companyId);
    const attentionKey = buildBankSyncFailureAttentionKey(bankAccount.id);

    await notify(
      {
        recipientUserId: firmAssigneeId,
        firmCompanyId,
        clientCompanyId: companyId,
        policyOwnerCompanyId: firmCompanyId,
        eventType: NOTIFICATION_TYPE.SYNC_FAILURE_REQUIRES_ACTION,
        attentionKey,
        priority: 'high',
        readPolicy: 'explicit',
        title: `Review transaction import for ${bankAccount.displayName}`,
        destination: {
          workspace: 'banking',
          bankAccountId: bankAccount.id,
          action: 'review_transaction_sync_failure',
        },
        sourceEntity: { type: 'bank_account', id: bankAccount.id },
        idempotencyKey: `test-sync-failure:${bankAccount.id}:open`,
      },
      { trx },
    );

    const intentCount = await writeBankSyncFailureResolvedNotifications(trx, {
      clientCompanyId: companyId,
      bankAccountId: bankAccount.id,
      stateVersion: '2026-06-21T00:00:00.000Z',
    });

    expect(intentCount).toBe(1);
    const [resolutionIntent] = await trx('app.outbox')
      .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED })
      .andWhereRaw(`payload->>'attentionKey' = ?`, [attentionKey]);

    expect(resolutionIntent?.payload).toEqual(
      expect.objectContaining({
        recipientUserId: firmAssigneeId,
        attentionKey,
        companyId,
      }),
    );
  });
});

async function createConnectedBankAccountFixture(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    userId: string;
    bankId: string;
  },
): Promise<{
  id: string;
  accountNumber: string;
  displayName: string;
  providerId: string;
  connectionId: string;
  feedId: string;
}> {
  const provider = await trx('bank_feed_providers')
    .select('id')
    .first<{ id: string }>();
  if (!provider) {
    throw new Error('Expected a bank feed provider fixture');
  }

  const connectionResult = await createBankConnection({
    data: {
      company_id: input.companyId,
      provider_id: provider.id,
      authorization_status: 'active',
      connected_by_id: input.userId,
    },
    trx,
  });
  if (!connectionResult.success || !connectionResult.data) {
    throw new Error(
      connectionResult.message || 'Failed to create bank connection fixture',
    );
  }
  const connectionId = connectionResult.data.id;

  const accountNumber = randomUUID();
  const displayName = `Connected bank ${randomUUID()}`;
  const result = await createBankAccountWithConnection({
    trx,
    companyId: input.companyId,
    userId: input.userId,
    params: {
      displayName,
      accountNumber,
      accountNumberMask: '1234',
      accountType: 'checkings_current',
      businessOrPersonal: 'business',
      bankId: input.bankId,
      currencyCode: 'USD',
    },
  });

  if (!result.success || !result.data?.bankAccountId) {
    throw new Error(
      result.message || 'Failed to create connected bank account',
    );
  }

  const feedResult = await createBankAccountFeed({
    data: {
      company_id: input.companyId,
      bank_account_id: result.data.bankAccountId,
      bank_connection_id: connectionId,
      provider_account_id: `provider-account-${randomUUID()}`,
      sync_from_timezone: 'Etc/UTC',
      connected_by_id: input.userId,
    },
    trx,
  });
  if (!feedResult.success || !feedResult.data?.id) {
    throw new Error(
      feedResult.message || 'Failed to create bank account feed fixture',
    );
  }

  return {
    id: result.data.bankAccountId,
    accountNumber,
    displayName,
    providerId: provider.id,
    connectionId,
    feedId: feedResult.data.id,
  };
}

async function ensureClientOwnerRole(
  trx: Knex.Transaction,
  input: { companyId: string; userId: string; actorUserId: string },
): Promise<void> {
  const role = await trx('roles')
    .where({ key: 'client_owner' })
    .first<{ id: string }>('id');
  if (!role) {
    throw new Error('client_owner role fixture not found');
  }

  const existing = await trx('user_company_roles')
    .where({
      company_id: input.companyId,
      user_id: input.userId,
      is_deleted: false,
    })
    .first('id');

  if (existing) {
    await trx('user_company_roles').where({ id: existing.id }).update({
      role_id: role.id,
      updated_by_id: input.actorUserId,
      updated_at: trx.fn.now(),
    });
    return;
  }

  await trx('user_company_roles').insert({
    company_id: input.companyId,
    user_id: input.userId,
    role_id: role.id,
    created_by_id: input.actorUserId,
  });
}

async function replaceClientAssignee(
  trx: Knex.Transaction,
  input: {
    clientCompanyId: string;
    firmStaffUserId: string;
    actorUserId: string;
  },
): Promise<void> {
  await trx('app.firm_user_client_assignments')
    .where({ client_company_id: input.clientCompanyId, is_deleted: false })
    .update({
      is_deleted: true,
      deleted_at: trx.fn.now(),
      updated_by_id: input.actorUserId,
    });

  await trx('app.firm_user_client_assignments').insert({
    client_company_id: input.clientCompanyId,
    firm_staff_user_id: input.firmStaffUserId,
    created_by_id: input.actorUserId,
  });
}

async function resolveFirmCompanyId(
  trx: Knex.Transaction,
  clientCompanyId: string,
): Promise<string> {
  const assignment = await trx('app.client_firm_assignments')
    .where({ client_company_id: clientCompanyId, is_deleted: false })
    .first('accounting_firm_company_id');
  if (assignment?.accounting_firm_company_id) {
    return assignment.accounting_firm_company_id;
  }

  const company = await trx('companies')
    .where({ id: clientCompanyId })
    .first('id', 'assigned_firm_id');
  if (company?.assigned_firm_id) {
    return company.assigned_firm_id;
  }
  if (company?.id) {
    return company.id;
  }

  throw new Error(`Company ${clientCompanyId} not found`);
}

async function countCompanyRows(
  trx: Knex.Transaction,
  companyId: string,
): Promise<{
  coa: number;
  coaVersions: number;
  bankAccounts: number;
  snapshotVersion: bigint;
}> {
  const [coa, coaVersions, bankAccounts, snapshot] = await Promise.all([
    countRows(trx('coa').where({ company_id: companyId })),
    countRows(
      trx('coa_versions')
        .join('coa', 'coa_versions.coa_id', 'coa.id')
        .where({ 'coa.company_id': companyId }),
    ),
    countRows(trx('bank_accounts').where({ company_id: companyId })),
    trx('coa_snapshot_versions').where({ company_id: companyId }).first<{
      snapshot_version: string | number | bigint;
    }>('snapshot_version'),
  ]);

  return {
    coa,
    coaVersions,
    bankAccounts,
    snapshotVersion: BigInt(snapshot?.snapshot_version ?? 0),
  };
}

async function countRows(query: Knex.QueryBuilder): Promise<number> {
  const row = await query.count<{ count: string }>('* as count').first();
  return Number(row?.count ?? 0);
}
