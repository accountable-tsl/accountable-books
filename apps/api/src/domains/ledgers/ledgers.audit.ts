import type { Knex } from 'knex';
import { z } from 'zod';

import { zDateYMD } from '../../core/types/core.js';
import {
  resolveAuditEventActorContext,
  writeAuditEventsBatch,
} from '../audit/index.js';
import { txnCategorizationSource } from '../categorization/categorization.types.js';
import { ledgerTransactionSource } from './ledgers.types.js';

import type {
  AuditActorInput,
  AuditContextInput,
  WriteAuditEventInputCamel,
} from '../audit/index.js';
import type { TxnCategorizationSource } from '../categorization/categorization.types.js';
import type { LedgerTransactionSource } from './ledgers.types.js';

export const LEDGER_AUDIT_SCHEMA_VERSION = '1.1.0';

const LEDGER_POST_ACTION = 'ledger.post';

const ledgerPostEntrySnapshot = z.object({
  coaId: z.uuid(),
  sourceAmount: z.number(),
  fsDate: zDateYMD,
  isBankLeg: z.boolean(),
  contactId: z.uuid().nullable(),
});

export const ledgerPostPayloadV1 = z.object({
  transactionSource: ledgerTransactionSource,
  categorizationSource: txnCategorizationSource,
  sourceTransactionId: z.uuid(),
  transactionDate: zDateYMD,
  sourceTransactionAmount: z.number().nullable(),
  sourceTransactionCurrencyId: z.uuid(),
  entries: z.array(ledgerPostEntrySnapshot).min(2),
  categorizationCandidateId: z.uuid().nullable(),
  isFx: z.boolean(),
});

export type LedgerPostPayload = z.infer<typeof ledgerPostPayloadV1>;

export type LedgerPostEntrySnapshot = z.infer<typeof ledgerPostEntrySnapshot>;

export type LedgerPostAuditRecord = {
  ledgerTransactionId: string;
  transactionSource: LedgerTransactionSource;
  categorizationSource: TxnCategorizationSource;
  sourceTransactionId: string;
  transactionDate: string;
  sourceTransactionAmount: number | null;
  sourceTransactionCurrencyId: string;
  categorizationCandidateId: string | null;
  isFx: boolean;
  entries: LedgerPostEntrySnapshot[];
};

export async function writeLedgerPostAuditBatch(input: {
  companyId: string;
  actor: AuditActorInput;
  context?: AuditContextInput;
  records: LedgerPostAuditRecord[];
  trx: Knex.Transaction;
  eventAt?: string;
}): Promise<void> {
  if (input.records.length === 0) return;

  const fields = resolveAuditEventActorContext(input.actor, input.context);
  const eventAt = input.eventAt ?? new Date().toISOString();

  const auditInputs: WriteAuditEventInputCamel<LedgerPostPayload>[] =
    input.records.map((record) => ({
      companyId: input.companyId,
      entityType: 'ledger',
      entityId: record.ledgerTransactionId,
      action: LEDGER_POST_ACTION,
      schemaVersion: LEDGER_AUDIT_SCHEMA_VERSION,
      payload: {
        transactionSource: record.transactionSource,
        categorizationSource: record.categorizationSource,
        sourceTransactionId: record.sourceTransactionId,
        transactionDate: record.transactionDate,
        sourceTransactionAmount: record.sourceTransactionAmount,
        sourceTransactionCurrencyId: record.sourceTransactionCurrencyId,
        entries: record.entries,
        categorizationCandidateId: record.categorizationCandidateId,
        isFx: record.isFx,
      },
      actorType: fields.actorType,
      actorId: fields.actorId,
      userId: fields.userId,
      impersonatedByUserId: fields.impersonatedByUserId,
      eventAt,
      source: fields.source,
      requestId: fields.requestId,
      correlationId: fields.correlationId,
      ip: fields.ip,
      userAgent: fields.userAgent,
    }));

  await writeAuditEventsBatch(ledgerPostPayloadV1, auditInputs, input.trx);
}
