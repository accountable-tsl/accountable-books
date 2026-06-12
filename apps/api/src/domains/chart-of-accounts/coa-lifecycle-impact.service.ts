import type { Knex } from 'knex';

import { actionDefinition } from '../categorization/rules/rules-def.types.js';

import type {
  CoaDerivedDataInvalidation,
  CoaLifecycleImpact,
  CoaLifecycleReference,
} from './coa.types.js';

type DerivedDataIds = {
  legacyPredictionIds: string[];
  predictionIds: string[];
  candidateIds: string[];
};

export type CoaLifecycleImpactInspection = {
  impactsByCoaId: Map<string, CoaLifecycleImpact>;
  referencesByCoaId: Map<string, CoaLifecycleReferences>;
  derivedDataIds: DerivedDataIds;
};

export type CoaLifecycleReferences = {
  bankAccounts: CoaLifecycleReference[];
  ledgerEntries: number;
  draftJournals: CoaLifecycleReference[];
  recurringTemplates: CoaLifecycleReference[];
  categorizationRules: CoaLifecycleReference[];
};

export async function inspectCoaLifecycleImpacts({
  trx,
  companyId,
  coaIds,
}: {
  trx: Knex.Transaction;
  companyId: string;
  coaIds: string[];
}): Promise<CoaLifecycleImpactInspection> {
  const sortedCoaIds = [...new Set(coaIds)].sort();
  const impactsByCoaId = new Map(
    sortedCoaIds.map((coaId) => [coaId, emptyImpact(coaId)]),
  );
  const referencesByCoaId = new Map(
    sortedCoaIds.map((coaId) => [coaId, emptyReferences()]),
  );

  const bankAccounts = await trx('bank_accounts')
    .where({ company_id: companyId, is_deleted: false })
    .whereIn('coa_id', sortedCoaIds)
    .orderBy('id')
    .forUpdate()
    .select<
      { id: string; coa_id: string; display_name: string }[]
    >('id', 'coa_id', 'display_name');
  incrementImpacts(impactsByCoaId, bankAccounts, 'bankAccounts');
  addReferences(referencesByCoaId, bankAccounts, 'bankAccounts', (row) => ({
    id: row.id,
    label: row.display_name,
  }));

  const ledgerEntryCounts = await trx('ledger_entries')
    .whereIn('coa_id', sortedCoaIds)
    .groupBy('coa_id')
    .select<
      { coa_id: string; count: string }[]
    >('coa_id', trx.raw('COUNT(*)::text AS count'));
  for (const row of ledgerEntryCounts) {
    const references = referencesByCoaId.get(row.coa_id);
    if (references) references.ledgerEntries = Number(row.count);
  }

  const draftJournalEntries = await trx('journal_entries as je')
    .join('journal_batches as jb', 'je.journal_batch_id', 'jb.id')
    .where({
      'jb.company_id': companyId,
      'jb.status': 'draft',
      'jb.is_deleted': false,
      'je.is_deleted': false,
    })
    .whereIn('je.coa_id', sortedCoaIds)
    .orderBy('je.id')
    .forUpdate('je')
    .select<
      {
        coa_id: string;
        journal_batch_id: string;
        title: string;
        reference: string | null;
      }[]
    >('je.coa_id', 'je.journal_batch_id', 'jb.title', 'jb.reference');
  const draftJournalIds = uniqueSorted(
    draftJournalEntries.map((entry) => entry.journal_batch_id),
  );
  if (draftJournalIds.length > 0) {
    await trx('journal_batches')
      .whereIn('id', draftJournalIds)
      .orderBy('id')
      .forUpdate()
      .select('id');
  }
  incrementDistinctImpacts(
    impactsByCoaId,
    draftJournalEntries,
    'journal_batch_id',
    'draftJournals',
  );
  addDistinctReferences(
    referencesByCoaId,
    draftJournalEntries,
    'journal_batch_id',
    'draftJournals',
    (row) => ({
      id: row.journal_batch_id,
      label: row.reference ? `${row.title} (${row.reference})` : row.title,
    }),
  );

  const recurringEntries = await trx('recurring_journal_template_entries as e')
    .join('recurring_journal_templates as t', function () {
      this.on('e.template_id', '=', 't.id').andOn(
        'e.company_id',
        '=',
        't.company_id',
      );
    })
    .where('t.company_id', companyId)
    .where('e.company_id', companyId)
    .where('t.is_deleted', false)
    .whereNot('t.status', 'closed')
    .whereIn('e.coa_id', sortedCoaIds)
    .orderBy('e.template_id')
    .orderBy('e.line_number')
    .forUpdate('e')
    .select<
      {
        coa_id: string;
        template_id: string;
        title: string | null;
        description: string;
      }[]
    >('e.coa_id', 'e.template_id', 't.title', 't.description');
  const recurringTemplateIds = uniqueSorted(
    recurringEntries.map((entry) => entry.template_id),
  );
  if (recurringTemplateIds.length > 0) {
    await trx('recurring_journal_templates')
      .whereIn('id', recurringTemplateIds)
      .orderBy('id')
      .forUpdate()
      .select('id');
  }
  incrementDistinctImpacts(
    impactsByCoaId,
    recurringEntries,
    'template_id',
    'recurringTemplates',
  );
  addDistinctReferences(
    referencesByCoaId,
    recurringEntries,
    'template_id',
    'recurringTemplates',
    (row) => ({
      id: row.template_id,
      label: row.title ?? row.description,
    }),
  );

  const ruleRows = await trx('rules as r')
    .join('rule_actions as a', 'a.rule_id', 'r.id')
    .where({
      'r.enabled': true,
      'r.is_deleted': false,
    })
    .andWhere((builder) => {
      for (const coaId of sortedCoaIds) {
        builder.orWhereRaw('a.definition::text LIKE ?', [`%${coaId}%`]);
      }
    })
    .orderBy('r.id')
    .forUpdate(['r', 'a'])
    .select<
      {
        id: string;
        name: string;
        scope: string;
        company_id: string | null;
        definition: unknown;
      }[]
    >('r.id', 'r.name', 'r.scope', 'r.company_id', 'a.definition');
  for (const rule of ruleRows) {
    const parsed = actionDefinition.safeParse(rule.definition);
    if (!parsed.success) {
      throw new Error(`Active categorization rule ${rule.id} is invalid`);
    }

    const referencedCoaIds = new Set(
      parsed.data.actions.flatMap((action) =>
        action.type === 'categorize'
          ? action.lines.map((line) => line.coa_id)
          : [],
      ),
    );
    for (const coaId of referencedCoaIds) {
      const impact = impactsByCoaId.get(coaId);
      if (impact) impact.categorizationRules += 1;
      const references = referencesByCoaId.get(coaId);
      if (references) {
        references.categorizationRules.push({
          id: rule.id,
          label: rule.name,
          resolvable: rule.scope === 'company' && rule.company_id === companyId,
        });
      }
    }
  }

  const legacyPredictions = await trx('predictions')
    .where({ company_id: companyId, is_deleted: false })
    .whereIn('coa_id', sortedCoaIds)
    .orderBy('id')
    .forUpdate()
    .select<{ id: string; coa_id: string }[]>('id', 'coa_id');
  incrementImpacts(impactsByCoaId, legacyPredictions, 'predictions');

  const predictionLines = await trx('categorization_prediction_lines as l')
    .join('categorization_predictions as p', 'l.prediction_id', 'p.id')
    .where({
      'p.company_id': companyId,
      'p.is_deleted': false,
      'l.is_deleted': false,
    })
    .whereIn('l.coa_id', sortedCoaIds)
    .orderBy('l.id')
    .forUpdate('l')
    .select<{ coa_id: string; prediction_id: string }[]>(
      'l.coa_id',
      'l.prediction_id',
    );
  const predictionIds = uniqueSorted(
    predictionLines.map((line) => line.prediction_id),
  );
  if (predictionIds.length > 0) {
    await trx('categorization_predictions')
      .whereIn('id', predictionIds)
      .orderBy('id')
      .forUpdate()
      .select('id');
  }
  incrementDistinctImpacts(
    impactsByCoaId,
    predictionLines,
    'prediction_id',
    'predictions',
  );

  const candidateLines = await trx('categorization_candidate_lines as l')
    .join('categorization_candidates as c', 'l.candidate_id', 'c.id')
    .where({
      'c.company_id': companyId,
      'c.is_deleted': false,
      'l.is_deleted': false,
    })
    .whereIn('l.coa_id', sortedCoaIds)
    .orderBy('l.id')
    .forUpdate('l')
    .select<{ coa_id: string; candidate_id: string }[]>(
      'l.coa_id',
      'l.candidate_id',
    );
  const candidateIds = uniqueSorted(
    candidateLines.map((line) => line.candidate_id),
  );
  if (candidateIds.length > 0) {
    await trx('categorization_candidates')
      .whereIn('id', candidateIds)
      .orderBy('id')
      .forUpdate()
      .select('id');
  }
  incrementDistinctImpacts(
    impactsByCoaId,
    candidateLines,
    'candidate_id',
    'candidates',
  );

  return {
    impactsByCoaId,
    referencesByCoaId,
    derivedDataIds: {
      legacyPredictionIds: uniqueSorted(
        legacyPredictions.map((prediction) => prediction.id),
      ),
      predictionIds,
      candidateIds,
    },
  };
}

export async function invalidateCoaDerivedData({
  trx,
  inspection,
  userId,
}: {
  trx: Knex.Transaction;
  inspection: CoaLifecycleImpactInspection;
  userId: string;
}): Promise<CoaDerivedDataInvalidation> {
  const { legacyPredictionIds, predictionIds, candidateIds } =
    inspection.derivedDataIds;
  const now = new Date();
  const headDeletion = {
    is_deleted: true,
    deleted_at: now,
    updated_by_id: userId,
  };
  const lineDeletion = {
    is_deleted: true,
    deleted_at: now,
  };

  if (legacyPredictionIds.length > 0) {
    await trx('predictions')
      .whereIn('id', legacyPredictionIds)
      .update(headDeletion);
  }
  if (predictionIds.length > 0) {
    await trx('categorization_prediction_lines')
      .whereIn('prediction_id', predictionIds)
      .update(lineDeletion);
    await trx('categorization_predictions')
      .whereIn('id', predictionIds)
      .update(headDeletion);
  }
  if (candidateIds.length > 0) {
    await trx('categorization_candidate_lines')
      .whereIn('candidate_id', candidateIds)
      .update(lineDeletion);
    await trx('categorization_candidates')
      .whereIn('id', candidateIds)
      .update(headDeletion);
  }

  return {
    predictions: legacyPredictionIds.length + predictionIds.length,
    candidates: candidateIds.length,
  };
}

function emptyImpact(coaId: string): CoaLifecycleImpact {
  return {
    coaId,
    bankAccounts: 0,
    draftJournals: 0,
    recurringTemplates: 0,
    categorizationRules: 0,
    predictions: 0,
    candidates: 0,
  };
}

function emptyReferences(): CoaLifecycleReferences {
  return {
    bankAccounts: [],
    ledgerEntries: 0,
    draftJournals: [],
    recurringTemplates: [],
    categorizationRules: [],
  };
}

function addReferences<T extends { coa_id: string }>(
  referencesByCoaId: Map<string, CoaLifecycleReferences>,
  rows: T[],
  field: keyof Omit<CoaLifecycleReferences, 'ledgerEntries'>,
  mapReference: (row: T) => CoaLifecycleReference,
): void {
  for (const row of rows) {
    referencesByCoaId.get(row.coa_id)?.[field].push(mapReference(row));
  }
}

function addDistinctReferences<T extends { coa_id: string }, K extends keyof T>(
  referencesByCoaId: Map<string, CoaLifecycleReferences>,
  rows: T[],
  identityField: K,
  field: keyof Omit<CoaLifecycleReferences, 'ledgerEntries'>,
  mapReference: (row: T) => CoaLifecycleReference,
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const identity = `${row.coa_id}:${String(row[identityField])}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    referencesByCoaId.get(row.coa_id)?.[field].push(mapReference(row));
  }
}

function incrementImpacts(
  impacts: Map<string, CoaLifecycleImpact>,
  rows: Array<{ coa_id: string }>,
  field: keyof Omit<CoaLifecycleImpact, 'coaId'>,
): void {
  for (const row of rows) {
    const impact = impacts.get(row.coa_id);
    if (impact) impact[field] += 1;
  }
}

function incrementDistinctImpacts<
  T extends { coa_id: string },
  K extends keyof T,
>(
  impacts: Map<string, CoaLifecycleImpact>,
  rows: T[],
  identityField: K,
  impactField: keyof Omit<CoaLifecycleImpact, 'coaId'>,
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const identity = `${row.coa_id}:${String(row[identityField])}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const impact = impacts.get(row.coa_id);
    if (impact) impact[impactField] += 1;
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
