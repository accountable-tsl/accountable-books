import type { Knex } from 'knex';

import { generateChecksumSync } from '../../../shared/index.js';
import { actionDefinition } from './rules-def.types.js';

export async function replaceCoaInCategorizationRules({
  trx,
  companyId,
  sourceCoaId,
  replacementCoaId,
  ruleIds,
  userId,
}: {
  trx: Knex.Transaction;
  companyId: string;
  sourceCoaId: string;
  replacementCoaId: string;
  ruleIds: string[];
  userId: string;
}): Promise<void> {
  const rows = await companyRuleActions({ trx, companyId, ruleIds });
  assertEveryReferenceExists(
    ruleIds,
    rows.map((row) => row.id),
  );

  for (const row of rows) {
    const parsed = actionDefinition.parse(row.definition);
    let replacements = 0;
    const definition = {
      actions: parsed.actions.map((action) => {
        if (action.type !== 'categorize') return action;
        return {
          ...action,
          lines: action.lines.map((line) => {
            if (line.coa_id !== sourceCoaId) return line;
            replacements += 1;
            return { ...line, coa_id: replacementCoaId };
          }),
        };
      }),
    };
    if (replacements === 0) {
      throw new Error(
        `Categorization rule ${row.id} no longer references account`,
      );
    }

    await trx('rule_actions')
      .where({ rule_id: row.id })
      .update({
        definition,
        fingerprint: generateChecksumSync(definition),
      });
    await trx('rules').where({ id: row.id }).update({
      updated_by_id: userId,
      updated_at: trx.fn.now(),
    });
  }
}

export async function disableCategorizationRulesForCoaResolution({
  trx,
  companyId,
  ruleIds,
  userId,
}: {
  trx: Knex.Transaction;
  companyId: string;
  ruleIds: string[];
  userId: string;
}): Promise<void> {
  const updated = await trx('rules')
    .where({
      company_id: companyId,
      scope: 'company',
      enabled: true,
      is_deleted: false,
    })
    .whereIn('id', ruleIds)
    .update({
      enabled: false,
      updated_by_id: userId,
      updated_at: trx.fn.now(),
    })
    .returning<{ id: string }[]>('id');

  assertEveryReferenceExists(
    ruleIds,
    updated.map((row) => row.id),
  );
}

async function companyRuleActions({
  trx,
  companyId,
  ruleIds,
}: {
  trx: Knex.Transaction;
  companyId: string;
  ruleIds: string[];
}) {
  return trx('rules as r')
    .join('rule_actions as a', 'a.rule_id', 'r.id')
    .where({
      'r.company_id': companyId,
      'r.scope': 'company',
      'r.enabled': true,
      'r.is_deleted': false,
    })
    .whereIn('r.id', ruleIds)
    .orderBy('r.id')
    .forUpdate(['r', 'a'])
    .select<{ id: string; definition: unknown }[]>('r.id', 'a.definition');
}

function assertEveryReferenceExists(
  expectedIds: string[],
  actualIds: string[],
): void {
  const actual = new Set(actualIds);
  const missing = [...new Set(expectedIds)].filter((id) => !actual.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Categorization rule references changed: ${missing.join(', ')}`,
    );
  }
}
