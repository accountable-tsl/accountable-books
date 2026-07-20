import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { toYMD } from '../../shared/index.js';
import { allocateSequence } from '../sequence-counter/sc.model.js';
import { genJournalRefInput } from './journals.types.js';

import type {
  GenJournalReferenceInput,
  GenJournalReferenceResult,
} from './journals.types.js';

export function firstOfMonth(dateOnly: string): string {
  // dateOnly: "YYYY-MM-DD"
  return `${dateOnly.slice(0, 7)}-01`;
}

export function yyyymm(sequenceMonth: string): string {
  // "YYYY-MM-01" -> "YYYYMM"
  return sequenceMonth.slice(0, 4) + sequenceMonth.slice(5, 7);
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

const JOURNAL_PREFIX = 'JE';

/**
 * Generates journal sequencing fields for JE-YYYYMM-NNNN.
 * - bucket: "YYYY-MM-01" (sequenceMonth)
 * - allocated N from sequence_counters (atomic)
 * - systemReference string
 *
 * Call this when transitioning to "posted" (or when you decide numbering happens).
 */
export async function generateJournalReference(
  params: GenJournalReferenceInput & { trx?: Knex.Transaction },
): Promise<GenJournalReferenceResult> {
  const { trx, ...rest } = params;
  const knex = trx ?? knexClient;

  const v = genJournalRefInput.parse(rest);
  const d =
    typeof v.journalDate === 'string' ? new Date(v.journalDate) : v.journalDate;

  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid journalDate: ${String(v.journalDate)}`);
  }

  // Use the journal "date" for sequencing
  const dateOnly = toYMD(d); // "YYYY-MM-DD", UTC
  const sequenceMonth = firstOfMonth(dateOnly); // "YYYY-MM-01"

  // Allocate sequence number for this company + scope + month
  const sequenceNumber = await allocateSequence({
    companyId: v.companyId,
    scope: 'journal',
    bucket: sequenceMonth,
    trx,
  });

  const systemReference = `${JOURNAL_PREFIX}-${yyyymm(sequenceMonth)}-${pad4(sequenceNumber)}`;

  return { sequenceMonth, sequenceNumber, systemReference };
}
