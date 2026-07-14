import { Buffer } from 'node:buffer';
import type { Knex } from 'knex';

import {
  writeNotificationAttentionResolvedIntent,
  writeNotificationRequestedIntent,
} from '../../notifications/notification-intent.js';
import { NOTIFICATION_TYPE } from '../../notifications/notifications.types.js';

import type { NotificationAttentionTransition } from '../../notifications/notifications.types.js';
import type { BankAccountConnectionStatus } from './bankAccounts.types.js';

const RECONNECT_REQUIRED_STATUSES = new Set<BankAccountConnectionStatus>([
  'revoked',
  'error',
]);

interface BankReconnectRecipient {
  userId: string;
  policyOwnerCompanyId: string;
}

export interface BankReconnectLifecycleInput {
  bankAccountId: string;
  clientCompanyId: string;
  previousConnectionStatus: BankAccountConnectionStatus | null;
  nextConnectionStatus: BankAccountConnectionStatus;
  bankAccountName: string;
  previousSyncError?: string | null;
  syncError?: string | null;
  stateVersion: Date | string;
}

export interface BankSyncFailureInput {
  clientCompanyId: string;
  credentialId: string;
  failures: Array<{
    bankAccountId: string;
    error: string;
    failedTransactionCount?: number;
  }>;
  stateVersion: Date | string;
}

interface BankSyncFailureSummary {
  bankAccountId: string;
  bankAccountName: string;
  failedBatchCount: number;
  failedTransactionCount: number | null;
  errors: string[];
}

export function buildBankReconnectAttentionKey(bankAccountId: string): string {
  return `bank_account:${bankAccountId}:reconnect`;
}

export function buildBankSyncFailureAttentionKey(
  bankAccountId: string,
): string {
  return `bank_account:${bankAccountId}:sync_failure`;
}

export async function writeBankReconnectNotificationLifecycle(
  trx: Knex.Transaction,
  input: BankReconnectLifecycleInput,
): Promise<number> {
  if (input.previousConnectionStatus === input.nextConnectionStatus) {
    const syncErrorChanged =
      normalizeSyncError(input.previousSyncError) !==
      normalizeSyncError(input.syncError);
    if (
      syncErrorChanged &&
      RECONNECT_REQUIRED_STATUSES.has(input.nextConnectionStatus)
    ) {
      return writeBankReconnectRequestedNotifications(trx, {
        ...input,
        transition: 'material_update',
      });
    }

    return 0;
  }

  const wasReconnectRequired =
    input.previousConnectionStatus != null &&
    RECONNECT_REQUIRED_STATUSES.has(input.previousConnectionStatus);
  const isReconnectRequired = RECONNECT_REQUIRED_STATUSES.has(
    input.nextConnectionStatus,
  );

  if (isReconnectRequired) {
    return writeBankReconnectRequestedNotifications(trx, {
      ...input,
      transition: wasReconnectRequired ? 'material_update' : 'opened',
    });
  }

  if (wasReconnectRequired && input.nextConnectionStatus === 'connected') {
    return writeBankReconnectResolvedNotifications(trx, input);
  }

  return 0;
}

export async function writeBankSyncFailureRequiresActionNotifications(
  trx: Knex.Transaction,
  input: BankSyncFailureInput,
): Promise<number> {
  const summaries = await summarizeSyncFailures(trx, input);
  if (summaries.length === 0) {
    return 0;
  }

  const firmCompanyId = await resolveManagingFirmCompanyIdOrNull(
    trx,
    input.clientCompanyId,
  );
  const recipients = await loadBookkeepingActionRecipients(trx, {
    clientCompanyId: input.clientCompanyId,
    firmCompanyId,
  });

  let intentCount = 0;
  for (const summary of summaries) {
    for (const recipient of recipients) {
      await writeNotificationRequestedIntent(trx, {
        recipientUserId: recipient.userId,
        firmCompanyId,
        clientCompanyId: input.clientCompanyId,
        policyOwnerCompanyId: recipient.policyOwnerCompanyId,
        eventType: NOTIFICATION_TYPE.SYNC_FAILURE_REQUIRES_ACTION,
        attentionKey: buildBankSyncFailureAttentionKey(summary.bankAccountId),
        attentionTransition: 'opened',
        priority: 'high',
        readPolicy: 'explicit',
        title: `Review transaction import for ${summary.bankAccountName}`,
        body: 'Some bank transactions could not be imported and need bookkeeping review.',
        destination: {
          workspace: 'banking',
          bankAccountId: summary.bankAccountId,
          credentialId: input.credentialId,
          action: 'review_transaction_sync_failure',
        },
        sourceEntity: { type: 'bank_account', id: summary.bankAccountId },
        idempotencyKey: [
          'notification',
          NOTIFICATION_TYPE.SYNC_FAILURE_REQUIRES_ACTION,
          recipient.userId,
          summary.bankAccountId,
          syncFailureFingerprint(summary),
          toNotificationStateVersion(input.stateVersion),
        ].join(':'),
        data: {
          bankAccountId: summary.bankAccountId,
          bankAccountName: summary.bankAccountName,
          credentialId: input.credentialId,
          failedBatchCount: summary.failedBatchCount,
          failedTransactionCount: summary.failedTransactionCount,
          errors: summary.errors,
        },
      });
      intentCount++;
    }
  }

  return intentCount;
}

export async function writeBankSyncFailureResolvedNotifications(
  trx: Knex.Transaction,
  input: {
    clientCompanyId: string;
    bankAccountId: string;
    stateVersion: Date | string;
  },
): Promise<number> {
  const attentionKey = buildBankSyncFailureAttentionKey(input.bankAccountId);

  const activeNotifications = await trx('app.notifications')
    .where({
      client_company_id: input.clientCompanyId,
      event_type: NOTIFICATION_TYPE.SYNC_FAILURE_REQUIRES_ACTION,
    })
    .where('attention_key', attentionKey)
    .whereNull('resolved_at')
    .whereNull('archived_at')
    .select('recipient_user_id', 'attention_key');

  for (const notification of activeNotifications) {
    await writeNotificationAttentionResolvedIntent(trx, {
      recipientUserId: notification.recipient_user_id as string,
      attentionKey: notification.attention_key as string,
      companyId: input.clientCompanyId,
      idempotencyKey: [
        'notification',
        NOTIFICATION_TYPE.SYNC_FAILURE_REQUIRES_ACTION,
        notification.recipient_user_id as string,
        notification.attention_key as string,
        'resolved',
        toNotificationStateVersion(input.stateVersion),
      ].join(':'),
    });
  }

  return activeNotifications.length;
}

async function writeBankReconnectRequestedNotifications(
  trx: Knex.Transaction,
  input: BankReconnectLifecycleInput & {
    transition: NotificationAttentionTransition;
  },
): Promise<number> {
  const firmCompanyId = await resolveManagingFirmCompanyId(
    trx,
    input.clientCompanyId,
  );
  const recipients = await loadBankReconnectRecipients(trx, {
    clientCompanyId: input.clientCompanyId,
    firmCompanyId,
  });

  for (const recipient of recipients) {
    await writeNotificationRequestedIntent(trx, {
      recipientUserId: recipient.userId,
      firmCompanyId,
      clientCompanyId: input.clientCompanyId,
      policyOwnerCompanyId: recipient.policyOwnerCompanyId,
      eventType: NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
      attentionKey: buildBankReconnectAttentionKey(input.bankAccountId),
      attentionTransition: input.transition,
      priority: 'high',
      readPolicy: 'explicit',
      title: `Reconnect ${input.bankAccountName}`,
      body: bankReconnectBody(input.nextConnectionStatus),
      destination: {
        workspace: 'banking',
        bankAccountId: input.bankAccountId,
        action: 'reconnect_bank_account',
      },
      sourceEntity: { type: 'bank_account', id: input.bankAccountId },
      idempotencyKey: [
        'notification',
        NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
        recipient.userId,
        input.bankAccountId,
        input.nextConnectionStatus,
        input.transition,
        toNotificationStateVersion(input.stateVersion),
      ].join(':'),
      data: {
        bankAccountId: input.bankAccountId,
        bankAccountName: input.bankAccountName,
        connectionStatus: input.nextConnectionStatus,
        ...(input.syncError ? { syncError: input.syncError } : {}),
      },
    });
  }

  return recipients.length;
}

async function writeBankReconnectResolvedNotifications(
  trx: Knex.Transaction,
  input: BankReconnectLifecycleInput,
): Promise<number> {
  const firmCompanyId = await resolveManagingFirmCompanyId(
    trx,
    input.clientCompanyId,
  );
  const currentRecipients = await loadBankReconnectRecipients(trx, {
    clientCompanyId: input.clientCompanyId,
    firmCompanyId,
  });
  const activeRecipients = await loadActiveReconnectNotificationRecipients(
    trx,
    {
      clientCompanyId: input.clientCompanyId,
      attentionKey: buildBankReconnectAttentionKey(input.bankAccountId),
    },
  );
  const recipientUserIds = [
    ...new Set([
      ...currentRecipients.map((recipient) => recipient.userId),
      ...activeRecipients,
    ]),
  ].sort();

  for (const recipientUserId of recipientUserIds) {
    await writeNotificationAttentionResolvedIntent(trx, {
      recipientUserId,
      attentionKey: buildBankReconnectAttentionKey(input.bankAccountId),
      companyId: input.clientCompanyId,
      idempotencyKey: [
        'notification',
        NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
        recipientUserId,
        input.bankAccountId,
        'resolved',
        toNotificationStateVersion(input.stateVersion),
      ].join(':'),
    });
  }

  return recipientUserIds.length;
}

function bankReconnectBody(status: BankAccountConnectionStatus): string {
  if (status === 'revoked') {
    return 'The bank connection was revoked and needs to be reconnected before transactions can sync.';
  }
  return 'The bank connection has an error and needs attention before transactions can sync.';
}

function normalizeSyncError(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function loadBankReconnectRecipients(
  trx: Knex.Transaction,
  input: { clientCompanyId: string; firmCompanyId: string },
): Promise<BankReconnectRecipient[]> {
  const ownerRecipients = await loadClientOwnerRecipients(trx, {
    clientCompanyId: input.clientCompanyId,
  });
  const recipients = new Map<string, BankReconnectRecipient>();
  for (const recipient of ownerRecipients) {
    recipients.set(recipient.userId, recipient);
  }

  const assignee = await loadFirmAssigneeRecipient(trx, {
    clientCompanyId: input.clientCompanyId,
    firmCompanyId: input.firmCompanyId,
  });

  if (assignee && !recipients.has(assignee.userId)) {
    recipients.set(assignee.userId, assignee);
  }

  return [...recipients.values()];
}

async function loadBookkeepingActionRecipients(
  trx: Knex.Transaction,
  input: { clientCompanyId: string; firmCompanyId: string | null },
): Promise<BankReconnectRecipient[]> {
  if (input.firmCompanyId) {
    const assignee = await loadFirmAssigneeRecipient(trx, {
      clientCompanyId: input.clientCompanyId,
      firmCompanyId: input.firmCompanyId,
    });
    if (assignee) {
      return [assignee];
    }
  }

  return loadClientOwnerRecipients(trx, {
    clientCompanyId: input.clientCompanyId,
  });
}

async function loadClientOwnerRecipients(
  trx: Knex.Transaction,
  input: { clientCompanyId: string },
): Promise<BankReconnectRecipient[]> {
  const ownerRows = await trx('app.user_company_roles as ucr')
    .join('app.roles as r', 'r.id', 'ucr.role_id')
    .where({
      'ucr.company_id': input.clientCompanyId,
      'ucr.is_deleted': false,
    })
    .whereIn('r.key', ['client_owner', 'client_admin', 'admin'])
    .orderBy('ucr.created_at', 'asc')
    .select('ucr.user_id');

  const recipients = new Map<string, BankReconnectRecipient>();
  for (const row of ownerRows) {
    recipients.set(row.user_id as string, {
      userId: row.user_id as string,
      policyOwnerCompanyId: input.clientCompanyId,
    });
  }

  return [...recipients.values()];
}

async function loadFirmAssigneeRecipient(
  trx: Knex.Transaction,
  input: { clientCompanyId: string; firmCompanyId: string },
): Promise<BankReconnectRecipient | null> {
  const assignee = await trx('app.firm_user_client_assignments')
    .where({
      client_company_id: input.clientCompanyId,
      is_deleted: false,
    })
    .orderBy('created_at', 'asc')
    .first('firm_staff_user_id');

  if (!assignee?.firm_staff_user_id) {
    return null;
  }

  return {
    userId: assignee.firm_staff_user_id,
    policyOwnerCompanyId: input.firmCompanyId,
  };
}

async function loadActiveReconnectNotificationRecipients(
  trx: Knex.Transaction,
  input: { clientCompanyId: string; attentionKey: string },
): Promise<string[]> {
  const rows = await trx('app.notifications')
    .where({
      client_company_id: input.clientCompanyId,
      event_type: NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
      attention_key: input.attentionKey,
    })
    .whereNull('resolved_at')
    .whereNull('archived_at')
    .select('recipient_user_id');

  return rows.map((row) => row.recipient_user_id as string);
}

async function resolveManagingFirmCompanyId(
  trx: Knex.Transaction,
  clientCompanyId: string,
): Promise<string> {
  const firmCompanyId = await resolveManagingFirmCompanyIdOrNull(
    trx,
    clientCompanyId,
  );
  if (firmCompanyId) {
    return firmCompanyId;
  }

  throw new Error(`Company ${clientCompanyId} has no managing firm assignment`);
}

async function resolveManagingFirmCompanyIdOrNull(
  trx: Knex.Transaction,
  clientCompanyId: string,
): Promise<string | null> {
  const assignment = await trx('app.client_firm_assignments')
    .where({ client_company_id: clientCompanyId, is_deleted: false })
    .first('accounting_firm_company_id');

  if (assignment?.accounting_firm_company_id) {
    return assignment.accounting_firm_company_id;
  }

  const company = await trx('app.companies')
    .where({ id: clientCompanyId })
    .first('id', 'type', 'workspace_class', 'assigned_firm_id');

  if (!company) {
    throw new Error(`Company ${clientCompanyId} not found`);
  }
  if (company.assigned_firm_id) {
    return company.assigned_firm_id;
  }
  if (
    company.type === 'accounting_firm' ||
    company.workspace_class === 'customer'
  ) {
    return company.id;
  }

  return null;
}

async function summarizeSyncFailures(
  trx: Knex.Transaction,
  input: BankSyncFailureInput,
): Promise<BankSyncFailureSummary[]> {
  const grouped = new Map<
    string,
    {
      failedBatchCount: number;
      failedTransactionCount: number;
      hasTransactionCount: boolean;
      errors: Set<string>;
    }
  >();

  for (const failure of input.failures) {
    const error = failure.error.trim();
    if (!failure.bankAccountId || !error) {
      continue;
    }

    const current = grouped.get(failure.bankAccountId) ?? {
      failedBatchCount: 0,
      failedTransactionCount: 0,
      hasTransactionCount: false,
      errors: new Set<string>(),
    };
    current.failedBatchCount++;
    if (failure.failedTransactionCount != null) {
      current.failedTransactionCount += failure.failedTransactionCount;
      current.hasTransactionCount = true;
    }
    current.errors.add(error);
    grouped.set(failure.bankAccountId, current);
  }

  const accountIds = [...grouped.keys()];
  if (accountIds.length === 0) {
    return [];
  }

  const accountRows = await trx('app.bank_accounts')
    .where({
      company_id: input.clientCompanyId,
      connection_credential_id: input.credentialId,
    })
    .whereIn('id', accountIds)
    .select('id', 'display_name');
  const accountNames = new Map(
    accountRows.map((row) => [row.id as string, row.display_name as string]),
  );

  return accountIds
    .filter((bankAccountId) => accountNames.has(bankAccountId))
    .map((bankAccountId) => {
      const summary = grouped.get(bankAccountId)!;
      return {
        bankAccountId,
        bankAccountName: accountNames.get(bankAccountId)!,
        failedBatchCount: summary.failedBatchCount,
        failedTransactionCount: summary.hasTransactionCount
          ? summary.failedTransactionCount
          : null,
        errors: [...summary.errors].sort().slice(0, 5),
      };
    });
}

function syncFailureFingerprint(summary: BankSyncFailureSummary): string {
  return Buffer.from(
    [
      summary.bankAccountId,
      summary.failedBatchCount,
      summary.failedTransactionCount ?? 'unknown',
      ...summary.errors,
    ].join('|'),
  )
    .toString('base64url')
    .slice(0, 32);
}

function toNotificationStateVersion(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
