import type { Knex } from 'knex';

export async function replaceCoaInRecurringTemplates({
  trx,
  companyId,
  userId,
  sourceCoaId,
  replacementCoaId,
  templateIds,
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  sourceCoaId: string;
  replacementCoaId: string;
  templateIds: string[];
}): Promise<void> {
  const rows = await trx('recurring_journal_template_entries as e')
    .join('recurring_journal_templates as t', function () {
      this.on('t.id', '=', 'e.template_id').andOn(
        't.company_id',
        '=',
        'e.company_id',
      );
    })
    .where({
      't.company_id': companyId,
      't.is_deleted': false,
      'e.company_id': companyId,
      'e.coa_id': sourceCoaId,
    })
    .whereNot('t.status', 'closed')
    .whereIn('t.id', templateIds)
    .select<{ template_id: string }[]>('e.template_id');

  assertEveryReferenceExists(
    templateIds,
    rows.map((row) => row.template_id),
  );

  await trx('recurring_journal_template_entries')
    .where({ company_id: companyId, coa_id: sourceCoaId })
    .whereIn('template_id', templateIds)
    .update({ coa_id: replacementCoaId });

  await trx('recurring_journal_templates')
    .where({ company_id: companyId, is_deleted: false })
    .whereIn('id', templateIds)
    .update({
      updated_by_id: userId,
      updated_at: trx.fn.now(),
    });
}

export async function closeRecurringTemplatesForCoaResolution({
  trx,
  companyId,
  userId,
  templateIds,
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  templateIds: string[];
}): Promise<void> {
  const updated = await trx('recurring_journal_templates')
    .where({ company_id: companyId, is_deleted: false })
    .whereNot('status', 'closed')
    .whereIn('id', templateIds)
    .update({
      status: 'closed',
      next_run_date: null,
      updated_at: trx.fn.now(),
      updated_by_id: userId,
    })
    .returning<{ id: string }[]>('id');

  assertEveryReferenceExists(
    templateIds,
    updated.map((row) => row.id),
  );
}

function assertEveryReferenceExists(
  expectedIds: string[],
  actualIds: string[],
): void {
  const actual = new Set(actualIds);
  const missing = [...new Set(expectedIds)].filter((id) => !actual.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Recurring template references changed: ${missing.join(', ')}`,
    );
  }
}
