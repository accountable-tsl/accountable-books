import type { Knex } from 'knex';

import { voidDraftJournal } from './journals.command.js';

export async function replaceCoaInDraftJournals({
  trx,
  companyId,
  sourceCoaId,
  replacementCoaId,
  journalIds,
  userId,
}: {
  trx: Knex.Transaction;
  companyId: string;
  sourceCoaId: string;
  replacementCoaId: string;
  journalIds: string[];
  userId: string;
}): Promise<void> {
  const rows = await trx('journal_entries as je')
    .join('journal_batches as jb', 'jb.id', 'je.journal_batch_id')
    .where({
      'jb.company_id': companyId,
      'jb.status': 'draft',
      'jb.is_deleted': false,
      'je.is_deleted': false,
      'je.entry_status': 'active',
      'je.coa_id': sourceCoaId,
    })
    .whereIn('jb.id', journalIds)
    .select<{ journal_batch_id: string }[]>('je.journal_batch_id');

  assertEveryReferenceExists(
    journalIds,
    rows.map((row) => row.journal_batch_id),
  );

  await trx('journal_entries')
    .where({
      company_id: companyId,
      coa_id: sourceCoaId,
      entry_status: 'active',
      is_deleted: false,
    })
    .whereIn('journal_batch_id', journalIds)
    .update({
      coa_id: replacementCoaId,
      updated_at: trx.fn.now(),
    });

  await trx('journal_batches').whereIn('id', journalIds).update({
    updated_by_id: userId,
    updated_at: trx.fn.now(),
  });
}

export async function voidDraftJournalsForCoaResolution({
  trx,
  companyId,
  journalIds,
  userId,
}: {
  trx: Knex.Transaction;
  companyId: string;
  journalIds: string[];
  userId: string;
}): Promise<void> {
  for (const journalBatchId of [...new Set(journalIds)].sort()) {
    const result = await voidDraftJournal({
      trx,
      companyId,
      userId,
      journalBatchId,
      voidReason: 'Voided while resolving chart-of-account references',
    });
    if (!result.success) {
      throw new Error(`Failed to void draft journal ${journalBatchId}`);
    }
  }
}

function assertEveryReferenceExists(
  expectedIds: string[],
  actualIds: string[],
): void {
  const actual = new Set(actualIds);
  const missing = [...new Set(expectedIds)].filter((id) => !actual.has(id));
  if (missing.length > 0) {
    throw new Error(`Draft journal references changed: ${missing.join(', ')}`);
  }
}
