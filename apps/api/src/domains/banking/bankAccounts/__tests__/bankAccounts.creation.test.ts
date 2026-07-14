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
import {
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
  updateBankAccounts,
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
    const accountNumber = randomUUID();
    const coaName = `Rolled back bank COA ${randomUUID()}`;
    const before = await countCompanyRows(trx, companyId);

    const result = await createBankAccountWithConnection({
      companyId,
      userId,
      params: {
        displayName: `Invalid connected bank ${randomUUID()}`,
        accountNumber,
        accountType: 'checkings_current',
        businessOrPersonal: 'business',
        bankId,
        currencyCode: 'USD',
        coaName,
        providerId: randomUUID(),
        providerBankAccountId: randomUUID(),
        connectionCredentialId: randomUUID(),
        connectionStatus: 'connected',
      },
    });

    expect(result.success).toBe(false);
    expect(await countCompanyRows(trx, companyId)).toEqual(before);
    expect(
      await trx('coa').where({ company_id: companyId, name: coaName }).first(),
    ).toBeUndefined();
    expect(
      await trx('bank_accounts')
        .where({ company_id: companyId, account_number: accountNumber })
        .first(),
    ).toBeUndefined();
  });

  it('does not allow transaction stream state on a manual account', async () => {
    const account = await createManualBankAccount({
      trx,
      companyId,
      userId,
      params: {
        displayName: `Manual stream state ${randomUUID()}`,
        accountNumber: randomUUID(),
        accountType: 'checkings_current',
        businessOrPersonal: 'business',
        bankId,
        currencyId: reportingCurrencyId,
      },
    });
    expect(account.success).toBe(true);

    await expect(
      trx('bank_accounts')
        .where({ id: account.data!.bankAccountId })
        .update({ transaction_sync_cursor: 'manual-cursor' }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('lets the database trigger reset stream state on identity changes', async () => {
    const account = await createConnectedBankAccountFixture(trx, {
      companyId,
      userId,
      bankId,
    });
    const seedStreamState = () =>
      trx('bank_accounts')
        .where({ id: account.id })
        .update({
          transaction_sync_cursor: 'old-cursor',
          initial_transaction_sync_completed_at: new Date(
            '2026-01-02T00:00:00Z',
          ),
          last_sync_at: new Date('2026-01-03T00:00:00Z'),
          sync_error: 'old error',
        });
    const expectCleared = async () => {
      expect(
        await trx('bank_accounts')
          .where({ id: account.id })
          .first(
            'transaction_sync_cursor',
            'initial_transaction_sync_completed_at',
            'last_sync_at',
            'sync_error',
          ),
      ).toEqual({
        transaction_sync_cursor: null,
        initial_transaction_sync_completed_at: null,
        last_sync_at: null,
        sync_error: null,
      });
    };

    await seedStreamState();
    await trx('bank_accounts')
      .where({ id: account.id })
      .update({
        provider_bank_account_id: `replacement-${randomUUID()}`,
      });
    await expectCleared();

    await seedStreamState();
    const credentialId = await createCredentialFixture(trx, {
      companyId,
      providerId: account.providerId,
      userId,
    });
    await trx('bank_accounts').where({ id: account.id }).update({
      connection_credential_id: credentialId,
    });
    await expectCleared();
  });

  it('excludes disconnected, deleted, and inactive-credential accounts from sync scans', async () => {
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
        connection_credential_id: account.credentialId,
      }),
    ]);
    expect(
      await getBankAccountSyncEligibility(
        { bankAccountId: account.id, companyId },
        trx,
      ),
    ).toEqual({ id: account.id, eligible: true, reason: null });

    await trx('bank_accounts')
      .where({ id: account.id })
      .update({ connection_status: 'error' });
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

    await trx('bank_accounts').where({ id: account.id }).update({
      connection_status: 'connected',
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

    await trx('bank_accounts').where({ id: account.id }).update({
      is_deleted: false,
      deleted_at: null,
    });
    await trx('bank_account_credentials')
      .where({ id: account.credentialId })
      .update({ status: 'expired' });
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
      reason: 'inactive_credential',
    });
  });

  it('opens bank reconnect notifications when connection status becomes error', async () => {
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

    const result = await updateBankAccounts({
      trx,
      companyId,
      userId,
      params: [
        {
          id: bankAccount.id,
          displayName: bankAccount.displayName,
          accountType: 'checkings_current',
          businessOrPersonal: 'business',
          connectionStatus: 'error',
          notes: 'provider auth failed',
        },
      ],
    });
    expect(result.success).toBe(true);

    const firmCompanyId = await resolveFirmCompanyId(trx, companyId);
    const intents = await trx('app.outbox')
      .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
      .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
        NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
      ])
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
          attentionKey: `bank_account:${bankAccount.id}:reconnect`,
          attentionTransition: 'opened',
          priority: 'high',
          readPolicy: 'explicit',
          sourceEntity: { type: 'bank_account', id: bankAccount.id },
          data: expect.objectContaining({
            bankAccountId: bankAccount.id,
            connectionStatus: 'error',
          }),
        }),
        expect.objectContaining({
          recipientUserId: firmAssigneeId,
          clientCompanyId: companyId,
          policyOwnerCompanyId: firmCompanyId,
          eventType: NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
          attentionKey: `bank_account:${bankAccount.id}:reconnect`,
          attentionTransition: 'opened',
        }),
      ]),
    );
  });

  it('resolves bank reconnect notifications when reconnect returns status to connected', async () => {
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
    await updateBankAccounts({
      trx,
      companyId,
      userId,
      params: [
        {
          id: bankAccount.id,
          displayName: bankAccount.displayName,
          accountType: 'checkings_current',
          businessOrPersonal: 'business',
          connectionStatus: 'revoked',
          notes: 'credential revoked',
        },
      ],
    });

    const reconnectCredentialId = await createCredentialFixture(trx, {
      companyId,
      providerId: bankAccount.providerId,
      userId,
    });
    const reconnect = await createBankAccountWithConnection({
      trx,
      companyId,
      userId,
      params: {
        displayName: bankAccount.displayName,
        accountNumber: bankAccount.accountNumber,
        accountNumberMask: '1234',
        accountType: 'checkings_current',
        businessOrPersonal: 'business',
        bankId,
        currencyCode: 'USD',
        providerId: bankAccount.providerId,
        providerBankAccountId: randomUUID(),
        connectionCredentialId: reconnectCredentialId,
        connectionStatus: 'connected',
      },
    });
    expect(reconnect.success).toBe(true);
    expect(reconnect.data?.wasUpdated).toBe(true);

    const resolutionIntents = await trx('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
      })
      .orderBy('id', 'asc');

    expect(resolutionIntents).toHaveLength(2);
    expect(resolutionIntents.map((intent) => intent.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientUserId: userId,
          attentionKey: `bank_account:${bankAccount.id}:reconnect`,
          companyId,
        }),
        expect.objectContaining({
          recipientUserId: firmAssigneeId,
          attentionKey: `bank_account:${bankAccount.id}:reconnect`,
          companyId,
        }),
      ]),
    );
    for (const intent of resolutionIntents) {
      expect(String(intent.payload.idempotencyKey)).toContain('resolved');
      expect(String(intent.payload.idempotencyKey)).toContain(bankAccount.id);
    }
  });

  it('emits a reconnect material update when sync error changes on an already-broken connection', async () => {
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
    const events = await trx('app.outbox')
      .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
      .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
        NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
      ])
      .andWhereRaw(`payload->'event'->>'attentionTransition' = ?`, [
        'material_update',
      ])
      .then((intents) => intents.map((intent) => intent.payload.event));

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientUserId: userId,
          attentionKey: `bank_account:${bankAccount.id}:reconnect`,
          attentionTransition: 'material_update',
          data: expect.objectContaining({
            syncError: 'Latest auth error',
          }),
        }),
        expect.objectContaining({
          recipientUserId: firmAssigneeId,
          attentionKey: `bank_account:${bankAccount.id}:reconnect`,
          attentionTransition: 'material_update',
        }),
      ]),
    );
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
        credentialId: bankAccount.credentialId,
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
          credentialId: bankAccount.credentialId,
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
  credentialId: string;
}> {
  const provider = await trx('bank_feed_providers')
    .select('id')
    .first<{ id: string }>();
  if (!provider) {
    throw new Error('Expected a bank feed provider fixture');
  }
  const credentialId = await createCredentialFixture(trx, {
    companyId: input.companyId,
    providerId: provider.id,
    userId: input.userId,
  });
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
      providerId: provider.id,
      providerBankAccountId: randomUUID(),
      connectionCredentialId: credentialId,
      connectionStatus: 'connected',
    },
  });

  if (!result.success || !result.data?.bankAccountId) {
    throw new Error(
      result.message || 'Failed to create connected bank account',
    );
  }

  return {
    id: result.data.bankAccountId,
    accountNumber,
    displayName,
    providerId: provider.id,
    credentialId,
  };
}

async function createCredentialFixture(
  trx: Knex.Transaction,
  input: { companyId: string; providerId: string; userId: string },
): Promise<string> {
  const [credential] = await trx('bank_account_credentials')
    .insert({
      company_id: input.companyId,
      provider_id: input.providerId,
      item_identifier: randomUUID(),
      encrypted_access_token: `access-${randomUUID()}`,
      raw_metadata: JSON.stringify({ source: 'test' }),
      status: 'active',
      connected_by_id: input.userId,
    })
    .returning('id');

  return credential.id;
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
