import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { generateChecksumSync } from '../../../shared/index.js';
import {
  executeCoaLifecycle,
  preflightCoaLifecycle,
} from '../coa-lifecycle.service.js';

import type { CoaLifecycleResolution } from '../coa.types.js';

type Fixture = {
  companyId: string;
  userId: string;
  sourceCoaId: string;
  replacementCoaId: string;
  draftJournalId: string;
  recurringTemplateId: string;
  ruleId: string;
};

describe('COA explicit lifecycle reference resolution', () => {
  const db = getTestDb();
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture(db);
  });

  afterEach(async () => {
    await cleanupFixture(db, fixture.companyId);
  });

  it('returns detailed references with a stable impact fingerprint', async () => {
    const first = await preflight('delete');
    const second = await preflight('delete');

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.data?.impactFingerprint).toBe(second.data?.impactFingerprint);
    expect(first.data?.accounts[0]).toMatchObject({
      id: fixture.sourceCoaId,
      blockers: [],
      references: {
        ledgerEntries: { count: 0 },
        draftJournals: [{ id: fixture.draftJournalId }],
        recurringTemplates: [{ id: fixture.recurringTemplateId }],
        categorizationRules: [{ id: fixture.ruleId, resolvable: true }],
      },
    });
    expect(first.data?.canExecuteWithoutResolution).toBe(false);
  });

  it('resolves references explicitly and records the lifecycle decision', async () => {
    const inspected = await preflight('delete');
    expect(inspected.success).toBe(true);

    const result = await executeCoaLifecycle({
      companyId: fixture.companyId,
      userId: fixture.userId,
      data: {
        operation: 'delete',
        accountIds: [fixture.sourceCoaId],
        impactFingerprint: inspected.data!.impactFingerprint,
        resolutions: [
          {
            referenceType: 'draft_journal',
            sourceCoaId: fixture.sourceCoaId,
            referenceIds: [fixture.draftJournalId],
            action: 'replace',
            replacementCoaId: fixture.replacementCoaId,
          },
          {
            referenceType: 'recurring_template',
            sourceCoaId: fixture.sourceCoaId,
            referenceIds: [fixture.recurringTemplateId],
            action: 'close',
          },
          {
            referenceType: 'categorization_rule',
            sourceCoaId: fixture.sourceCoaId,
            referenceIds: [fixture.ruleId],
            action: 'disable',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(await coaState()).toMatchObject({
      is_active: false,
      is_deleted: true,
    });
    expect(
      await db('journal_entries')
        .where({ journal_batch_id: fixture.draftJournalId })
        .first('coa_id'),
    ).toMatchObject({ coa_id: fixture.replacementCoaId });
    expect(
      await db('recurring_journal_templates')
        .where({ id: fixture.recurringTemplateId })
        .first('status'),
    ).toMatchObject({ status: 'closed' });
    expect(
      await db('rules').where({ id: fixture.ruleId }).first('enabled'),
    ).toMatchObject({
      enabled: false,
    });

    const audit = await db('audit_events')
      .where({
        entity_type: 'chart_of_account',
        entity_id: fixture.sourceCoaId,
        action: 'chart_of_account.lifecycle_executed',
      })
      .first<{ payload: Record<string, unknown> }>('payload');
    expect(audit?.payload).toMatchObject({
      operation: 'delete',
      resolvedReferenceTypes: [
        'categorization_rule',
        'draft_journal',
        'recurring_template',
      ],
      remainingReferences: {
        draftJournals: 0,
        recurringTemplates: 0,
        categorizationRules: 0,
      },
    });
  });

  it('rolls back earlier resolutions when a later resolution is stale', async () => {
    const inspected = await preflight('delete');

    const result = await executeCoaLifecycle({
      companyId: fixture.companyId,
      userId: fixture.userId,
      data: {
        operation: 'delete',
        accountIds: [fixture.sourceCoaId],
        impactFingerprint: inspected.data!.impactFingerprint,
        resolutions: [
          {
            referenceType: 'draft_journal',
            sourceCoaId: fixture.sourceCoaId,
            referenceIds: [fixture.draftJournalId],
            action: 'replace',
            replacementCoaId: fixture.replacementCoaId,
          },
          {
            referenceType: 'categorization_rule',
            sourceCoaId: fixture.sourceCoaId,
            referenceIds: [randomUUID()],
            action: 'disable',
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(await coaState()).toMatchObject({
      is_active: true,
      is_deleted: false,
    });
    expect(
      await db('journal_entries')
        .where({ journal_batch_id: fixture.draftJournalId })
        .first('coa_id'),
    ).toMatchObject({ coa_id: fixture.sourceCoaId });
    expect(
      await db('audit_events')
        .where({ entity_id: fixture.sourceCoaId })
        .first('id'),
    ).toBeUndefined();
  });

  it('coalesces identical destructive resolutions for shared references', async () => {
    await db('journal_entries').insert({
      description: null,
      side: 'credit',
      amount: 100,
      journal_batch_id: fixture.draftJournalId,
      coa_id: fixture.replacementCoaId,
    });
    await db('recurring_journal_template_entries').insert({
      company_id: fixture.companyId,
      template_id: fixture.recurringTemplateId,
      line_number: 2,
      description: 'Shared recurring line',
      amount: 100,
      transaction_side: 'credit',
      coa_id: fixture.replacementCoaId,
    });
    const sharedRuleDefinition = {
      actions: [
        {
          type: 'categorize',
          lines: [
            {
              split_type: 'fixed',
              description: 'First target',
              amount: 50,
              coa_id: fixture.sourceCoaId,
            },
            {
              split_type: 'remainder',
              description: 'Second target',
              coa_id: fixture.replacementCoaId,
            },
          ],
        },
      ],
    };
    await db('rule_actions')
      .where({ rule_id: fixture.ruleId })
      .update({
        definition: sharedRuleDefinition,
        fingerprint: generateChecksumSync(sharedRuleDefinition),
      });

    const inspected = await preflightCoaLifecycle({
      companyId: fixture.companyId,
      data: {
        operation: 'delete',
        accountIds: [fixture.sourceCoaId, fixture.replacementCoaId],
      },
    });
    const resolutions: CoaLifecycleResolution[] = [
      fixture.sourceCoaId,
      fixture.replacementCoaId,
    ].flatMap((sourceCoaId): CoaLifecycleResolution[] => [
      {
        referenceType: 'draft_journal',
        sourceCoaId,
        referenceIds: [fixture.draftJournalId],
        action: 'void',
      },
      {
        referenceType: 'recurring_template',
        sourceCoaId,
        referenceIds: [fixture.recurringTemplateId],
        action: 'close',
      },
      {
        referenceType: 'categorization_rule',
        sourceCoaId,
        referenceIds: [fixture.ruleId],
        action: 'disable',
      },
    ]);

    const result = await executeCoaLifecycle({
      companyId: fixture.companyId,
      userId: fixture.userId,
      data: {
        operation: 'delete',
        accountIds: [fixture.sourceCoaId, fixture.replacementCoaId],
        impactFingerprint: inspected.data!.impactFingerprint,
        resolutions,
      },
    });

    expect(result.success).toBe(true);
    expect(
      await db('coa')
        .whereIn('id', [fixture.sourceCoaId, fixture.replacementCoaId])
        .orderBy('id')
        .select('is_active', 'is_deleted'),
    ).toEqual([
      { is_active: false, is_deleted: true },
      { is_active: false, is_deleted: true },
    ]);
  });

  it('rejects stale fingerprints before applying resolutions', async () => {
    const inspected = await preflight('delete');
    await addDraftJournal(db, fixture, fixture.sourceCoaId);

    const result = await executeCoaLifecycle({
      companyId: fixture.companyId,
      userId: fixture.userId,
      data: {
        operation: 'delete',
        accountIds: [fixture.sourceCoaId],
        impactFingerprint: inspected.data!.impactFingerprint,
        resolutions: [],
      },
    });

    expect(result).toMatchObject({
      success: false,
      code: 'CONFLICT',
      error: {
        reason: 'stale_impact_fingerprint',
        retryable: true,
      },
    });
    expect(await coaState()).toMatchObject({
      is_active: true,
      is_deleted: false,
    });
  });

  it('requires explicit acknowledgement before archiving unresolved references', async () => {
    const inspected = await preflight('archive');

    const rejected = await executeCoaLifecycle({
      companyId: fixture.companyId,
      userId: fixture.userId,
      data: {
        operation: 'archive',
        accountIds: [fixture.sourceCoaId],
        impactFingerprint: inspected.data!.impactFingerprint,
        resolutions: [],
      },
    });
    expect(rejected).toMatchObject({
      success: false,
      code: 'OPERATION_NOT_ALLOWED',
    });

    const accepted = await executeCoaLifecycle({
      companyId: fixture.companyId,
      userId: fixture.userId,
      data: {
        operation: 'archive',
        accountIds: [fixture.sourceCoaId],
        impactFingerprint: inspected.data!.impactFingerprint,
        acknowledgeUnresolvedArchiveReferences: true,
        resolutions: [],
      },
    });
    expect(accepted.success).toBe(true);
    expect(await coaState()).toMatchObject({
      is_active: false,
      is_deleted: false,
    });
  });

  function preflight(operation: 'archive' | 'delete') {
    return preflightCoaLifecycle({
      companyId: fixture.companyId,
      data: { operation, accountIds: [fixture.sourceCoaId] },
    });
  }

  function coaState() {
    return db('coa')
      .where({ id: fixture.sourceCoaId })
      .first('is_active', 'is_deleted');
  }
});

async function createFixture(db: Knex): Promise<Fixture> {
  return db.transaction(async (trx) => {
    const sourceCompany = await trx('companies')
      .where({ short_code: 'bizDemoUS' })
      .first<Record<string, unknown>>();
    const accountType = await trx('account_types')
      .where({ key: 'ca_other' })
      .first<{ id: string }>('id');
    if (!sourceCompany || !accountType) {
      throw new Error(
        'Expected demo company and ca_other account type fixtures',
      );
    }

    const companyId = randomUUID();
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const userId = String(sourceCompany.created_by_id);
    const currencyId = String(sourceCompany.reporting_currency_id);
    await trx('companies').insert({
      ...sourceCompany,
      id: companyId,
      legal_name: `COA resolution ${suffix}`,
      display_name: `COA resolution ${suffix}`,
      short_code: `coaResolve_${suffix}`,
      workspace_class: 'demo',
      assigned_firm_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      is_deleted: false,
      deleted_at: null,
    });

    const accounts = await trx('coa')
      .insert([
        {
          name: `Source ${suffix}`,
          source: 'user',
          account_type_id: accountType.id,
          currency_id: currencyId,
          company_id: companyId,
          created_by_id: userId,
          updated_by_id: userId,
        },
        {
          name: `Replacement ${suffix}`,
          source: 'user',
          account_type_id: accountType.id,
          currency_id: currencyId,
          company_id: companyId,
          created_by_id: userId,
          updated_by_id: userId,
        },
      ])
      .returning<{ id: string }[]>('id');
    const [source, replacement] = accounts;

    const draftJournalId = await addDraftJournal(
      trx,
      { companyId, userId, currencyId },
      source.id,
    );
    const [template] = await trx('recurring_journal_templates')
      .insert({
        description: `Recurring ${suffix}`,
        status: 'active',
        company_id: companyId,
        auto_post: false,
        currency_id: currencyId,
        template_timezone: 'Europe/London',
        frequency: 'monthly',
        start_date: new Date('2025-01-01'),
        next_run_date: new Date('2025-02-01'),
        created_by_id: userId,
      })
      .returning<{ id: string }[]>('id');
    await trx('recurring_journal_template_entries').insert({
      company_id: companyId,
      template_id: template.id,
      line_number: 1,
      description: 'Recurring line',
      amount: 100,
      transaction_side: 'debit',
      coa_id: source.id,
    });

    const [rule] = await trx('rules')
      .insert({
        name: `Rule ${suffix}`,
        scope: 'company',
        company_id: companyId,
        bank_scope: 'all',
        direction_filter: 'all',
        enabled: true,
        created_by_id: userId,
      })
      .returning<{ id: string }[]>('id');
    const definition = {
      actions: [
        {
          type: 'categorize',
          lines: [
            {
              split_type: 'remainder',
              description: 'Target account',
              coa_id: source.id,
            },
          ],
        },
      ],
    };
    await trx('rule_actions').insert({
      rule_id: rule.id,
      definition,
      fingerprint: generateChecksumSync(definition),
    });

    return {
      companyId,
      userId,
      sourceCoaId: source.id,
      replacementCoaId: replacement.id,
      draftJournalId,
      recurringTemplateId: template.id,
      ruleId: rule.id,
    };
  });
}

async function addDraftJournal(
  db: Knex | Knex.Transaction,
  fixture: Pick<Fixture, 'companyId' | 'userId'> & { currencyId?: string },
  coaId: string,
): Promise<string> {
  const currencyId =
    fixture.currencyId ??
    String(
      (
        await db('companies')
          .where({ id: fixture.companyId })
          .first<{ reporting_currency_id: string }>('reporting_currency_id')
      )?.reporting_currency_id,
    );
  const [batch] = await db('journal_batches')
    .insert({
      date: '2025-01-15',
      title: `Draft ${randomUUID()}`,
      currency_id: currencyId,
      status: 'draft',
      company_id: fixture.companyId,
      created_by_id: fixture.userId,
    })
    .returning<{ id: string }[]>('id');
  await db('journal_entries').insert({
    description: null,
    side: 'debit',
    amount: 100,
    journal_batch_id: batch.id,
    coa_id: coaId,
  });
  return batch.id;
}

async function cleanupFixture(db: Knex, companyId: string): Promise<void> {
  await db.transaction(async (trx) => {
    await trx.raw('SET LOCAL session_replication_role = replica');

    const journalIds = trx('journal_batches')
      .where({ company_id: companyId })
      .select('id');
    const templateIds = trx('recurring_journal_templates')
      .where({ company_id: companyId })
      .select('id');
    const ruleIds = trx('rules').where({ company_id: companyId }).select('id');

    await trx('audit_events').where({ company_id: companyId }).delete();
    await trx('rule_actions').whereIn('rule_id', ruleIds).delete();
    await trx('rules').where({ company_id: companyId }).delete();
    await trx('recurring_journal_template_entries')
      .whereIn('template_id', templateIds)
      .delete();
    await trx('recurring_journal_templates')
      .where({ company_id: companyId })
      .delete();
    await trx('journal_entries')
      .whereIn('journal_batch_id', journalIds)
      .delete();
    await trx('journal_batches').where({ company_id: companyId }).delete();
    await trx('coa_versions').where({ company_id: companyId }).delete();
    await trx('coa_snapshot_versions')
      .where({ company_id: companyId })
      .delete();
    await trx('coa').where({ company_id: companyId }).delete();
    await trx('companies').where({ id: companyId }).delete();
  });
}
