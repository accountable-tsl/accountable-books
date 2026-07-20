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
  connectionId: string;
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

export function buildBankReplacementUnmatchedAttentionKey(
  feedId: string,
): string {
  return `bank_account_feed:${feedId}:replacement_unmatched`;
}

export function buildBankTransactionSupersededAttentionKey(
  bankTransactionId: string,
): string {
  return `bank_transaction:${bankTransactionId}:provider_superseded`;
}

export function buildBankTransactionRemovedAttentionKey(
  bankTransactionId: string,
): string {
  return `bank_transaction:${bankTransactionId}:provider_removed`;
}

export function buildHistoryImportAttentionKey(feedId: string): string {
  return `bank_account_feed:${feedId}:history_import`;
}

export interface HistoryImportNotificationInput {
  clientCompanyId: string;
  bankAccountId: string;
  bankAccountName: string;
  feedId: string;
  expiresAt: Date | string;
  stateVersion: Date | string;
}

export interface LedgerLinkedBankTransactionReviewInput {
  clientCompanyId: string;
  bankAccountId: string;
  bankAccountName: string;
  bankTransactionId: string;
  ledgerTransactionId: string;
  stateVersion: Date | string;
}

/**
 * The provider materially corrected a transaction that was already posted to
 * the ledger. The old bank transaction is retired and a replacement sits in
 * the inbox; the ledger posting still references the retired line and needs
 * bookkeeping review. The ledger is never changed automatically.
 */
export async function writeBankTransactionSupersededNotifications(
  trx: Knex.Transaction,
  input: LedgerLinkedBankTransactionReviewInput & {
    replacementBankTransactionId: string | null;
  },
): Promise<number> {
  const attentionKey = buildBankTransactionSupersededAttentionKey(
    input.bankTransactionId,
  );
  if (
    await hasTerminalReviewAttention(trx, {
      clientCompanyId: input.clientCompanyId,
      attentionKey,
    })
  ) {
    return 0;
  }

  return writeLedgerLinkedReviewNotifications(trx, {
    ...input,
    eventType: NOTIFICATION_TYPE.BANK_TRANSACTION_SUPERSEDED_REVIEW,
    attentionKey,
    title: `Review corrected bank transaction in ${input.bankAccountName}`,
    body: 'The bank corrected a transaction that was already posted to the ledger. The correction is in the inbox; the original posting needs review.',
    action: 'review_superseded_bank_transaction',
    extraData: {
      replacementBankTransactionId: input.replacementBankTransactionId,
    },
  });
}

/**
 * The provider removed a transaction that was already posted to the ledger.
 * The bank transaction is kept visible for audit; the posting needs
 * bookkeeping review. The ledger is never changed automatically.
 */
export async function writeBankTransactionRemovedNotifications(
  trx: Knex.Transaction,
  input: LedgerLinkedBankTransactionReviewInput,
): Promise<number> {
  const attentionKey = buildBankTransactionRemovedAttentionKey(
    input.bankTransactionId,
  );
  if (
    await hasTerminalReviewAttention(trx, {
      clientCompanyId: input.clientCompanyId,
      attentionKey,
    })
  ) {
    return 0;
  }

  return writeLedgerLinkedReviewNotifications(trx, {
    ...input,
    eventType: NOTIFICATION_TYPE.BANK_TRANSACTION_REMOVED_REVIEW,
    attentionKey,
    title: `Review removed bank transaction in ${input.bankAccountName}`,
    body: 'The bank removed a transaction that was already posted to the ledger. The bank line is kept for audit; the posting needs review.',
    action: 'review_removed_bank_transaction',
    extraData: {},
  });
}

export async function writeBankReplacementUnmatchedNotifications(
  trx: Knex.Transaction,
  input: {
    clientCompanyId: string;
    bankAccountId: string;
    bankAccountName: string;
    feedId: string;
    unmatchedCount: number;
    stateVersion: Date | string;
  },
): Promise<number> {
  if (input.unmatchedCount <= 0) return 0;

  const firmCompanyId = await resolveManagingFirmCompanyIdOrNull(
    trx,
    input.clientCompanyId,
  );
  const recipients = await loadBookkeepingActionRecipients(trx, {
    clientCompanyId: input.clientCompanyId,
    firmCompanyId,
  });

  let intentCount = 0;
  const attentionKey = buildBankReplacementUnmatchedAttentionKey(input.feedId);
  for (const recipient of recipients) {
    await writeNotificationRequestedIntent(trx, {
      recipientUserId: recipient.userId,
      firmCompanyId,
      clientCompanyId: input.clientCompanyId,
      policyOwnerCompanyId: recipient.policyOwnerCompanyId,
      eventType: NOTIFICATION_TYPE.BANK_REPLACEMENT_UNMATCHED_REVIEW,
      attentionKey,
      attentionTransition: 'opened',
      priority: 'high',
      readPolicy: 'explicit',
      title: `Review bank reconnection imports for ${input.bankAccountName}`,
      body: `${input.unmatchedCount} transaction(s) were imported after reconnecting without a confident match to prior history. Review them so categorization stays accurate.`,
      destination: {
        workspace: 'banking',
        bankAccountId: input.bankAccountId,
        feedId: input.feedId,
        action: 'review_replacement_unmatched',
      },
      sourceEntity: { type: 'bank_account', id: input.bankAccountId },
      idempotencyKey: [
        'notification',
        NOTIFICATION_TYPE.BANK_REPLACEMENT_UNMATCHED_REVIEW,
        recipient.userId,
        input.feedId,
        String(input.unmatchedCount),
        toNotificationStateVersion(input.stateVersion),
      ].join(':'),
      data: {
        bankAccountId: input.bankAccountId,
        bankAccountName: input.bankAccountName,
        feedId: input.feedId,
        unmatchedCount: input.unmatchedCount,
      },
    });
    intentCount += 1;
  }

  return intentCount;
}

async function writeLedgerLinkedReviewNotifications(
  trx: Knex.Transaction,
  input: LedgerLinkedBankTransactionReviewInput & {
    eventType:
      | typeof NOTIFICATION_TYPE.BANK_TRANSACTION_SUPERSEDED_REVIEW
      | typeof NOTIFICATION_TYPE.BANK_TRANSACTION_REMOVED_REVIEW;
    attentionKey: string;
    title: string;
    body: string;
    action: string;
    extraData: Record<string, unknown>;
  },
): Promise<number> {
  const firmCompanyId = await resolveManagingFirmCompanyIdOrNull(
    trx,
    input.clientCompanyId,
  );
  const recipients = await loadBookkeepingActionRecipients(trx, {
    clientCompanyId: input.clientCompanyId,
    firmCompanyId,
  });

  for (const recipient of recipients) {
    await writeNotificationRequestedIntent(trx, {
      recipientUserId: recipient.userId,
      firmCompanyId,
      clientCompanyId: input.clientCompanyId,
      policyOwnerCompanyId: recipient.policyOwnerCompanyId,
      eventType: input.eventType,
      attentionKey: input.attentionKey,
      attentionTransition: 'opened',
      priority: 'high',
      readPolicy: 'explicit',
      title: input.title,
      body: input.body,
      destination: {
        workspace: 'banking',
        bankAccountId: input.bankAccountId,
        bankTransactionId: input.bankTransactionId,
        action: input.action,
      },
      sourceEntity: { type: 'bank_transaction', id: input.bankTransactionId },
      idempotencyKey: [
        'notification',
        input.eventType,
        recipient.userId,
        input.bankTransactionId,
        toNotificationStateVersion(input.stateVersion),
      ].join(':'),
      data: {
        bankAccountId: input.bankAccountId,
        bankAccountName: input.bankAccountName,
        bankTransactionId: input.bankTransactionId,
        ledgerTransactionId: input.ledgerTransactionId,
        ...input.extraData,
      },
    });
  }

  return recipients.length;
}

export async function writeHistoryImportAvailableNotifications(
  trx: Knex.Transaction,
  input: HistoryImportNotificationInput,
): Promise<number> {
  return writeHistoryImportLifecycleNotifications(trx, {
    ...input,
    eventType: NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_AVAILABLE,
    attentionTransition: 'opened',
    priority: 'normal',
    readPolicy: 'explicit',
    title: `Historical transactions available for ${input.bankAccountName}`,
    body: 'You can import older transactions from before this account was connected. This offer expires in 30 days.',
    action: 'review_history_import',
  });
}

export async function writeHistoryImportExpiringSoonNotifications(
  trx: Knex.Transaction,
  input: HistoryImportNotificationInput,
): Promise<number> {
  return writeHistoryImportLifecycleNotifications(trx, {
    ...input,
    eventType: NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_EXPIRING_SOON,
    attentionTransition: 'material_update',
    priority: 'high',
    readPolicy: 'explicit',
    title: `History import expiring soon for ${input.bankAccountName}`,
    body: 'The offer to import older bank transactions expires in about 7 days. Select a starting date before it closes.',
    action: 'review_history_import',
  });
}

/**
 * Available offers resolve open attention; selected leftovers are informational only.
 */
export async function writeHistoryImportExpiredNotifications(
  trx: Knex.Transaction,
  input: HistoryImportNotificationInput & {
    priorStatus: 'available' | 'selected';
  },
): Promise<number> {
  if (input.priorStatus === 'available') {
    await resolveHistoryImportAttention(trx, {
      clientCompanyId: input.clientCompanyId,
      feedId: input.feedId,
      stateVersion: input.stateVersion,
    });
  }

  const body =
    input.priorStatus === 'available'
      ? 'The offer to import historical bank transactions has expired. Remaining unselected history was released.'
      : 'Unselected historical transaction candidates for this account have been released. Your earlier selection is unchanged.';

  return writeHistoryImportLifecycleNotifications(trx, {
    ...input,
    eventType: NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_EXPIRED,
    attentionTransition: 'routine_update',
    priority: 'normal',
    readPolicy: 'auto_on_view',
    title: `History import closed for ${input.bankAccountName}`,
    body,
    action: 'view_bank_account',
  });
}

export async function resolveHistoryImportAttention(
  trx: Knex.Transaction,
  input: {
    clientCompanyId: string;
    feedId: string;
    stateVersion: Date | string;
  },
): Promise<number> {
  return resolveBankReviewAttention(trx, {
    clientCompanyId: input.clientCompanyId,
    attentionKey: buildHistoryImportAttentionKey(input.feedId),
    eventTypes: [
      NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_AVAILABLE,
      NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_EXPIRING_SOON,
    ],
    stateVersion: input.stateVersion,
  });
}

/**
 * Resolve open attentions for a review key from active notification rows.
 */
export async function resolveBankReviewAttention(
  trx: Knex.Transaction,
  input: {
    clientCompanyId: string;
    attentionKey: string;
    eventType?: string;
    eventTypes?: string[];
    stateVersion: Date | string;
  },
): Promise<number> {
  const eventTypes =
    input.eventTypes ?? (input.eventType ? [input.eventType] : null);
  if (!eventTypes || eventTypes.length === 0) {
    throw new Error('resolveBankReviewAttention requires eventType(s)');
  }

  const activeNotifications = await trx('app.notifications')
    .where({
      client_company_id: input.clientCompanyId,
      attention_key: input.attentionKey,
    })
    .whereIn('event_type', eventTypes)
    .whereNull('resolved_at')
    .whereNull('archived_at')
    .select('recipient_user_id', 'attention_key', 'event_type');

  for (const notification of activeNotifications) {
    await writeNotificationAttentionResolvedIntent(trx, {
      recipientUserId: notification.recipient_user_id as string,
      attentionKey: notification.attention_key as string,
      companyId: input.clientCompanyId,
      idempotencyKey: [
        'notification',
        notification.event_type as string,
        notification.recipient_user_id as string,
        notification.attention_key as string,
        'resolved',
        toNotificationStateVersion(input.stateVersion),
      ].join(':'),
    });
  }

  return activeNotifications.length;
}

async function hasTerminalReviewAttention(
  trx: Knex.Transaction,
  input: { clientCompanyId: string; attentionKey: string },
): Promise<boolean> {
  const active = await trx('app.notifications')
    .where({
      client_company_id: input.clientCompanyId,
      attention_key: input.attentionKey,
    })
    .whereNull('resolved_at')
    .whereNull('archived_at')
    .first('id');
  if (active) return false;

  const resolved = await trx('app.notifications')
    .where({
      client_company_id: input.clientCompanyId,
      attention_key: input.attentionKey,
    })
    .whereNotNull('resolved_at')
    .first('id');
  return resolved != null;
}

async function writeHistoryImportLifecycleNotifications(
  trx: Knex.Transaction,
  input: HistoryImportNotificationInput & {
    eventType:
      | typeof NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_AVAILABLE
      | typeof NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_EXPIRING_SOON
      | typeof NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_EXPIRED;
    attentionTransition: NotificationAttentionTransition;
    priority: 'normal' | 'high';
    readPolicy: 'explicit' | 'auto_on_view';
    title: string;
    body: string;
    action: string;
  },
): Promise<number> {
  const firmCompanyId = await resolveManagingFirmCompanyIdOrNull(
    trx,
    input.clientCompanyId,
  );
  const recipients = await loadBookkeepingActionRecipients(trx, {
    clientCompanyId: input.clientCompanyId,
    firmCompanyId,
  });
  const attentionKey = buildHistoryImportAttentionKey(input.feedId);
  const expiresAtIso =
    input.expiresAt instanceof Date
      ? input.expiresAt.toISOString()
      : String(input.expiresAt);

  for (const recipient of recipients) {
    await writeNotificationRequestedIntent(trx, {
      recipientUserId: recipient.userId,
      firmCompanyId,
      clientCompanyId: input.clientCompanyId,
      policyOwnerCompanyId: recipient.policyOwnerCompanyId,
      eventType: input.eventType,
      attentionKey,
      attentionTransition: input.attentionTransition,
      priority: input.priority,
      readPolicy: input.readPolicy,
      title: input.title,
      body: input.body,
      destination: {
        workspace: 'banking',
        bankAccountId: input.bankAccountId,
        action: input.action,
      },
      sourceEntity: { type: 'bank_account', id: input.bankAccountId },
      idempotencyKey: [
        'notification',
        input.eventType,
        recipient.userId,
        input.feedId,
        toNotificationStateVersion(input.stateVersion),
      ].join(':'),
      data: {
        bankAccountId: input.bankAccountId,
        bankAccountName: input.bankAccountName,
        feedId: input.feedId,
        expiresAt: expiresAtIso,
      },
    });
  }

  return recipients.length;
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

  if (
    wasReconnectRequired &&
    (input.nextConnectionStatus === 'connected' ||
      input.nextConnectionStatus === 'revoked')
  ) {
    return resolveBankReconnectAttention(trx, {
      bankAccountId: input.bankAccountId,
      clientCompanyId: input.clientCompanyId,
      stateVersion: input.stateVersion,
    });
  }

  return 0;
}

export function buildBankConnectionDisconnectedAttentionKey(
  bankAccountId: string,
): string {
  return `bank_account:${bankAccountId}:disconnected`;
}

/** Informational disconnect notice — not reconnect attention/work. */
export async function writeBankConnectionDisconnectedNotifications(
  trx: Knex.Transaction,
  input: {
    clientCompanyId: string;
    bankAccountId: string;
    bankAccountName: string;
    connectionId: string;
    revocationOrigin: 'client' | 'provider';
    stateVersion?: Date | string;
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
  const stateVersion = input.stateVersion ?? new Date();
  const attentionKey = buildBankConnectionDisconnectedAttentionKey(
    input.bankAccountId,
  );
  const originLabel =
    input.revocationOrigin === 'provider' ? 'the bank' : 'a user';

  let intentCount = 0;
  for (const recipient of recipients) {
    await writeNotificationRequestedIntent(trx, {
      recipientUserId: recipient.userId,
      firmCompanyId,
      clientCompanyId: input.clientCompanyId,
      policyOwnerCompanyId: recipient.policyOwnerCompanyId,
      eventType: NOTIFICATION_TYPE.BANK_CONNECTION_DISCONNECTED,
      attentionKey,
      attentionTransition: 'opened',
      priority: 'normal',
      readPolicy: 'auto_on_view',
      title: `${input.bankAccountName} was disconnected`,
      body: `The bank connection for ${input.bankAccountName} was disconnected by ${originLabel}. Transactions will not sync until a new connection is made.`,
      destination: {
        workspace: 'banking',
        bankAccountId: input.bankAccountId,
        connectionId: input.connectionId,
        action: 'view_bank_account',
      },
      sourceEntity: { type: 'bank_account', id: input.bankAccountId },
      idempotencyKey: [
        'notification',
        NOTIFICATION_TYPE.BANK_CONNECTION_DISCONNECTED,
        recipient.userId,
        input.bankAccountId,
        input.connectionId,
        toNotificationStateVersion(stateVersion),
      ].join(':'),
      data: {
        bankAccountId: input.bankAccountId,
        bankAccountName: input.bankAccountName,
        connectionId: input.connectionId,
        revocationOrigin: input.revocationOrigin,
      },
    });
    intentCount += 1;
  }

  return intentCount;
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
          connectionId: input.connectionId,
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
          connectionId: input.connectionId,
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
      body: bankReconnectBody(),
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

export async function resolveBankReconnectAttention(
  trx: Knex.Transaction,
  input: {
    bankAccountId: string;
    clientCompanyId: string;
    stateVersion: Date | string;
  },
): Promise<number> {
  const firmCompanyId = await resolveManagingFirmCompanyId(
    trx,
    input.clientCompanyId,
  );
  const attentionKey = buildBankReconnectAttentionKey(input.bankAccountId);
  const currentRecipients = await loadBankReconnectRecipients(trx, {
    clientCompanyId: input.clientCompanyId,
    firmCompanyId,
  });
  const activeRecipients = await loadActiveReconnectNotificationRecipients(
    trx,
    {
      clientCompanyId: input.clientCompanyId,
      attentionKey,
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
      attentionKey,
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

function bankReconnectBody(): string {
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
    .where({ company_id: input.clientCompanyId })
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
