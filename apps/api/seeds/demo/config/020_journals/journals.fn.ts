import type { Knex } from 'knex';

import {
  postJournalRecord,
  reverseJournalRecord,
  voidDraftJournal,
} from '../../../../src/domains/journals/journals.command.js';
import { renderPlaceholders } from '../../../../src/domains/journals/recurring-templates.placeholders.js';
import {
  advanceRunDate,
  computeNextAlignedRunDate,
  todayYMDInTz,
  ymdToUtcDate,
} from '../../../../src/domains/journals/recurring-templates.schedule.js';
import {
  addDaysToYMD,
  toYMD,
} from '../../../../src/shared/utils/date.utils.js';
import {
  getCompanyIdMap,
  getDemoUserMap,
  getFilteredCompanyIds,
} from '../../shared/utils.js';
import { generateDemoCompaniesMap } from '../002_companies/companies.data.js';
import {
  JOURNAL_SEED_SCENARIOS,
  RECURRING_TEMPLATE_SEEDS,
} from './journals.data.js';

import type { JournalBatchData } from '../../../../src/domains/journals/journals.types.js';
import type { DemoFilter } from '../../shared/config.js';

const SEED_TAG = 'demo';

type CoaRow = {
  id: string;
  code: string | null;
  name: string;
  accountTypeKey: string;
  elementKey: string;
  defaultSide: 'debit' | 'credit';
};

type ContactRow = {
  id: string;
  display_name: string;
};

type ProjectRow = {
  id: string;
  name: string;
};

type CurrencyRow = {
  id: string;
  code: string;
  name: string;
  symbol: string;
};

type CoaPools = {
  all: CoaRow[];
  debit: CoaRow[];
  credit: CoaRow[];
};

const FX_RATE_BY_REPORTING: Record<string, Record<string, number>> = {
  USD: { EUR: 1.08, GBP: 1.27 },
  NGN: { USD: 1500, EUR: 1650, GBP: 1900 },
};

const FX_CURRENCY_PREFERENCE = ['EUR', 'GBP', 'USD', 'NGN'];

const normalize = (value: string | null | undefined) =>
  (value ?? '').toLowerCase();

const matchesHints = (row: CoaRow, hints: string[]) => {
  const haystack = `${row.code ?? ''} ${row.name}`.toLowerCase();
  return hints.some((hint) => haystack.includes(hint));
};

const pickFromPool = (
  pool: CoaRow[],
  hints: string[],
  excludeIds: Set<string>,
): CoaRow | null => {
  for (const row of pool) {
    if (excludeIds.has(row.id)) continue;
    if (matchesHints(row, hints)) return row;
  }
  return null;
};

const pickAccount = (
  pools: CoaPools,
  opts: {
    hints: string[];
    pool: 'debit' | 'credit' | 'any';
    excludeIds?: Set<string>;
  },
): CoaRow => {
  const exclude = opts.excludeIds ?? new Set<string>();
  const basePool =
    opts.pool === 'debit'
      ? pools.debit
      : opts.pool === 'credit'
        ? pools.credit
        : pools.all;

  const match = pickFromPool(basePool, opts.hints, exclude);
  if (match) return match;

  const fallbackMatch = pickFromPool(pools.all, opts.hints, exclude);
  if (fallbackMatch) return fallbackMatch;

  const fallback = basePool.find((row) => !exclude.has(row.id));
  if (fallback) return fallback;

  const anyFallback = pools.all.find((row) => !exclude.has(row.id));
  if (anyFallback) return anyFallback;

  throw new Error('No COA accounts available to select');
};

const pickContact = (
  contacts: ContactRow[],
  hints: string[] = [],
  seedIndex = 0,
): ContactRow | null => {
  if (contacts.length === 0) return null;
  if (hints.length) {
    const match = contacts.find((c) =>
      hints.some((hint) => normalize(c.display_name).includes(hint)),
    );
    if (match) return match;
  }
  const index = seedIndex % contacts.length;
  return contacts[index] ?? contacts[0] ?? null;
};

const pickProject = (
  projects: ProjectRow[],
  seedIndex = 0,
): ProjectRow | null => {
  if (projects.length === 0) return null;
  const index = seedIndex % projects.length;
  return projects[index] ?? projects[0] ?? null;
};

const buildReference = (template: string | undefined, shortCode: string) => {
  if (!template) return undefined;
  return template.replace('{{COMPANY}}', shortCode.toUpperCase());
};

const pickFxCurrency = (
  reportingCurrencyCode: string,
  currenciesByCode: Map<string, CurrencyRow>,
) => {
  const rates = FX_RATE_BY_REPORTING[reportingCurrencyCode] ?? {};

  for (const code of FX_CURRENCY_PREFERENCE) {
    if (code === reportingCurrencyCode) continue;
    if (!rates[code]) continue;
    const currency = currenciesByCode.get(code);
    if (!currency) continue;
    return {
      currency,
      exchangeRate: rates[code],
    };
  }

  return null;
};

const buildCoaPools = (rows: CoaRow[]): CoaPools => ({
  all: rows,
  debit: rows.filter((row) => row.defaultSide === 'debit'),
  credit: rows.filter((row) => row.defaultSide === 'credit'),
});

export const createDemoJournals = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  const companiesMap = generateDemoCompaniesMap(filters);
  if (companiesMap.length === 0) {
    console.log('No companies found for journal creation');
    return;
  }

  const companyIdMap = await getCompanyIdMap(trx);
  const userMap = await getDemoUserMap(trx);

  const currencyRows = (await trx('currencies')
    .whereIn('code', ['USD', 'EUR', 'GBP', 'NGN'])
    .select('id', 'code', 'name', 'symbol')) as CurrencyRow[];

  const currenciesByCode = new Map(
    currencyRows.map((row) => [row.code.toUpperCase(), row]),
  );

  for (const item of companiesMap) {
    const shortCode = item.company.shortCode;
    const companyId = companyIdMap.get(shortCode);
    if (!companyId) {
      console.log(`Company ID not found for ${shortCode}, skipping journals`);
      continue;
    }

    const existingSeed = await trx('journal_batches')
      .where('company_id', companyId)
      .whereRaw("metadata ->> 'seed' = ?", [SEED_TAG])
      .first('id');
    if (existingSeed) {
      console.log(
        `Seed journals/templates already exist for company ${shortCode}, skipping`,
      );
      continue;
    }

    const userId = userMap.get(item.user.email);
    if (!userId) {
      throw new Error(`Demo user not found for ${item.user.email}`);
    }

    const companyRow = await trx('companies as co')
      .join('currencies as cur', 'co.reporting_currency_id', 'cur.id')
      .where('co.id', companyId)
      .first(
        'co.default_timezone as defaultTimezone',
        'co.reporting_currency_id as reportingCurrencyId',
        'cur.code as reportingCurrencyCode',
      );

    if (!companyRow) {
      console.log(`Company ${shortCode} not found in database, skipping`);
      continue;
    }

    const reportingCurrencyId = companyRow.reportingCurrencyId as string;
    const reportingCurrencyCode = (
      companyRow.reportingCurrencyCode as string
    ).toUpperCase();
    const defaultTimezone = (companyRow.defaultTimezone as string) || 'Etc/UTC';

    const contacts = (await trx('contacts')
      .where('company_id', companyId)
      .where('status', 'active')
      .select('id', 'display_name')) as ContactRow[];

    const projects = (await trx('projects')
      .where('company_id', companyId)
      .select('id', 'name')) as ProjectRow[];

    const coaRows = (await trx('coa as c')
      .join('account_types as at', 'c.account_type_id', 'at.id')
      .join('account_elements as ae', 'at.account_element_id', 'ae.id')
      .where('c.company_id', companyId)
      .where('c.is_deleted', false)
      .where('c.is_active', true)
      .select(
        'c.id',
        'c.code',
        'c.name',
        trx.raw('at.key as "accountTypeKey"'),
        trx.raw('ae.key as "elementKey"'),
        trx.raw('ae.default_side as "defaultSide"'),
      )) as CoaRow[];

    if (coaRows.length === 0) {
      console.log(`No COA found for company ${shortCode}, skipping`);
      continue;
    }

    const coaPools = buildCoaPools(coaRows);
    const baseYMD = toYMD(new Date());

    const fxSelection = pickFxCurrency(reportingCurrencyCode, currenciesByCode);

    // Create standard journal scenarios
    for (const [scenarioIndex, scenario] of JOURNAL_SEED_SCENARIOS.entries()) {
      const journalDate = toYMD(addDaysToYMD(baseYMD, -scenario.daysAgo));
      const metadata = { seed: SEED_TAG, scenario: scenario.key } as Record<
        string,
        unknown
      >;

      const reference = buildReference(scenario.reference, shortCode);
      const autoReversalDate = scenario.autoReversalDays
        ? toYMD(addDaysToYMD(journalDate, scenario.autoReversalDays))
        : null;

      const excludeIds = new Set<string>();
      const debitAccount = pickAccount(coaPools, {
        hints: scenario.debitHints,
        pool: 'debit',
        excludeIds,
      });
      excludeIds.add(debitAccount.id);

      const creditAccount = pickAccount(coaPools, {
        hints: scenario.creditHints,
        pool: 'credit',
        excludeIds,
      });
      excludeIds.add(creditAccount.id);

      const contact = scenario.useContact
        ? pickContact(contacts, scenario.debitHints, scenarioIndex)
        : null;
      const project = scenario.useProject
        ? pickProject(projects, scenarioIndex)
        : null;

      const debitAmountA = scenario.splitDebit
        ? Number((scenario.amount * 0.6).toFixed(2))
        : Number(scenario.amount.toFixed(2));
      const debitAmountB = scenario.splitDebit
        ? Number((scenario.amount - debitAmountA).toFixed(2))
        : 0;

      type JournalEntrySeed = JournalBatchData['entries'][number];
      const entries: JournalEntrySeed[] = [
        {
          description: `${scenario.title} (line 1)`,
          side: 'debit',
          amount: debitAmountA,
          coaId: debitAccount.id,
          projectId: project?.id ?? null,
        },
        ...(scenario.splitDebit && debitAmountB > 0
          ? ([
              {
                description: `${scenario.title} (line 2)`,
                side: 'debit',
                amount: debitAmountB,
                coaId: debitAccount.id,
                projectId: null,
              },
            ] as JournalEntrySeed[])
          : []),
        {
          description: `${scenario.title} offset`,
          side: 'credit',
          amount: Number(scenario.amount.toFixed(2)),
          coaId: creditAccount.id,
          projectId: null,
        },
      ];

      const useFx = Boolean(scenario.fx && fxSelection);
      const currencyId = useFx ? fxSelection!.currency.id : reportingCurrencyId;
      const exchangeRate = useFx ? fxSelection!.exchangeRate : undefined;

      const result = await postJournalRecord({
        data: {
          date: journalDate,
          title: scenario.title,
          description: scenario.description,
          note: scenario.note,
          status: scenario.status,
          reference: reference ?? null,
          contactId: contact?.id ?? null,
          currencyId,
          exchangeRate,
          autoReversalDate,
          journalSource: 'one_off',
          recurringTemplateId: null,
          metadata,
          entries,
        },
        companyId,
        userId,
        trx,
      });

      if (!result.success || !result.data) {
        throw new Error(
          result.message || `Failed to create journal ${scenario.key}`,
        );
      }

      if (scenario.action === 'void') {
        const voidResult = await voidDraftJournal({
          journalBatchId: result.data.journalBatchId,
          companyId,
          userId,
          voidReason: 'Seeded demo void',
          trx,
        });
        if (!voidResult.success) {
          throw new Error(
            voidResult.message || `Failed to void journal ${scenario.key}`,
          );
        }
      }

      if (scenario.action === 'reverse') {
        const reversal = await reverseJournalRecord({
          journalBatchId: result.data.journalBatchId,
          companyId,
          userId,
          reversalReason: 'Seeded demo reversal',
          trx,
        });

        if (!reversal.success) {
          throw new Error(
            reversal.message || `Failed to reverse journal ${scenario.key}`,
          );
        }

        const reversalId = reversal.data?.reversalJournalId;
        if (reversalId) {
          await trx('journal_batches')
            .where('id', reversalId)
            .update({
              metadata: {
                seed: SEED_TAG,
                scenario: 'reversal',
                originalJournalId: result.data.journalBatchId,
              },
            });
        }
      }
    }

    // Create recurring templates + example generated journals
    const todayInTz = todayYMDInTz(defaultTimezone);

    for (const [
      templateIndex,
      template,
    ] of RECURRING_TEMPLATE_SEEDS.entries()) {
      const startYMD = addDaysToYMD(baseYMD, template.startOffsetDays);
      const nextRunYMD = computeNextAlignedRunDate({
        startYMD,
        frequency: template.frequency,
        todayYMD: todayInTz,
      });
      const nextRunDate = nextRunYMD
        ? ymdToUtcDate(nextRunYMD, defaultTimezone)
        : null;

      const excludeIds = new Set<string>();
      const debitAccount = pickAccount(coaPools, {
        hints: template.debitHints,
        pool: 'debit',
        excludeIds,
      });
      excludeIds.add(debitAccount.id);

      const creditAccount = pickAccount(coaPools, {
        hints: template.creditHints,
        pool: 'credit',
        excludeIds,
      });
      excludeIds.add(creditAccount.id);

      const contact = template.useContact
        ? pickContact(contacts, template.debitHints, templateIndex)
        : null;

      const [templateRow] = await trx('recurring_journal_templates')
        .insert({
          description: template.description,
          title: template.title ?? null,
          note: template.note ?? null,
          status: template.status ?? 'draft',
          company_id: companyId,
          auto_post: template.autoPost ?? false,
          currency_id: reportingCurrencyId,
          contact_id: contact?.id ?? null,
          template_timezone: defaultTimezone,
          frequency: template.frequency,
          start_date: ymdToUtcDate(startYMD, defaultTimezone),
          end_date: null,
          next_run_date: nextRunDate,
          auto_reversal_days: template.autoReversalDays ?? null,
          created_by_id: userId,
        })
        .returning(['id']);

      if (!templateRow?.id) {
        throw new Error(`Failed to create recurring template ${template.key}`);
      }

      await trx('recurring_journal_template_entries').insert([
        {
          company_id: companyId,
          template_id: templateRow.id,
          line_number: 1,
          description:
            template.entryDescriptionDebit ?? `${template.description} expense`,
          amount: template.amount,
          transaction_side: 'debit',
          coa_id: debitAccount.id,
        },
        {
          company_id: companyId,
          template_id: templateRow.id,
          line_number: 2,
          description:
            template.entryDescriptionCredit ?? `${template.description} offset`,
          amount: template.amount,
          transaction_side: 'credit',
          coa_id: creditAccount.id,
        },
      ]);

      const runDate = toYMD(
        addDaysToYMD(baseYMD, template.sampleRunOffsetDays),
      );
      const renderedTitle = renderPlaceholders(
        template.title ?? template.description,
        runDate,
        defaultTimezone,
      );
      const renderedNote = renderPlaceholders(
        template.note ?? null,
        runDate,
        defaultTimezone,
      );

      const renderedDebitDesc = renderPlaceholders(
        template.entryDescriptionDebit ?? `${template.description} expense`,
        runDate,
        defaultTimezone,
      );
      const renderedCreditDesc = renderPlaceholders(
        template.entryDescriptionCredit ?? `${template.description} offset`,
        runDate,
        defaultTimezone,
      );

      const autoReversalDate = template.autoReversalDays
        ? toYMD(addDaysToYMD(runDate, template.autoReversalDays))
        : null;

      const recurringResult = await postJournalRecord({
        data: {
          date: runDate,
          title: renderedTitle ?? template.description,
          description: template.description,
          note: renderedNote ?? undefined,
          status: template.autoPost ? 'posted' : 'draft',
          reference: null,
          contactId: contact?.id ?? null,
          currencyId: reportingCurrencyId,
          autoReversalDate,
          journalSource: 'generated_from_template',
          recurringTemplateId: templateRow.id,
          metadata: {
            seed: SEED_TAG,
            scenario: 'recurring',
            recurring: { templateId: templateRow.id, trigger: 'seed' },
          },
          entries: [
            {
              description: renderedDebitDesc ?? `${template.description} debit`,
              side: 'debit',
              amount: template.amount,
              coaId: debitAccount.id,
              projectId: null,
            },
            {
              description:
                renderedCreditDesc ?? `${template.description} credit`,
              side: 'credit',
              amount: template.amount,
              coaId: creditAccount.id,
              projectId: null,
            },
          ],
        },
        companyId,
        userId,
        trx,
      });

      if (!recurringResult.success) {
        throw new Error(
          recurringResult.message ||
            `Failed to create recurring journal for ${template.key}`,
        );
      }

      const nextAfterRun = advanceRunDate({
        fromYMD: runDate,
        frequency: template.frequency,
      });

      await trx('recurring_journal_templates')
        .where('id', templateRow.id)
        .update({
          last_run_at: new Date(),
          last_error: null,
          last_failed_at: null,
          next_run_date: ymdToUtcDate(nextAfterRun, defaultTimezone),
          updated_by_id: userId,
        });
    }

    console.log(`Created demo journals for company ${shortCode}`);
  }
};

export const deleteDemoJournals = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  const companyIds = await getFilteredCompanyIds(trx, filters);
  if (companyIds.length === 0) return;

  const templateIds = Array.from(
    new Set(
      (await trx('journal_batches')
        .whereIn('company_id', companyIds)
        .whereRaw("metadata ->> 'seed' = ?", [SEED_TAG])
        .whereNotNull('recurring_template_id')
        .pluck('recurring_template_id')) as string[],
    ),
  );

  const seededJournalIds = (await trx('journal_batches')
    .whereIn('company_id', companyIds)
    .whereRaw("metadata ->> 'seed' = ?", [SEED_TAG])
    .pluck('id')) as string[];

  const reversalJournalIds = seededJournalIds.length
    ? ((await trx('journal_batches')
        .whereIn('original_journal_id', seededJournalIds)
        .pluck('id')) as string[])
    : [];

  const allJournalIds = Array.from(
    new Set([...seededJournalIds, ...reversalJournalIds]),
  );

  if (allJournalIds.length > 0) {
    const ledgerTransactionIds = (await trx('journal_batches')
      .whereIn('id', allJournalIds)
      .whereNotNull('ledger_transaction_id')
      .pluck('ledger_transaction_id')) as string[];

    if (ledgerTransactionIds.length > 0) {
      await trx('ledger_audit_logs')
        .whereIn('ledger_transaction_id', ledgerTransactionIds)
        .delete();

      await trx('ledger_entries')
        .whereIn('ledger_transaction_id', ledgerTransactionIds)
        .delete();

      await trx('ledger_transactions')
        .whereIn('id', ledgerTransactionIds)
        .delete();
    }

    await trx('journal_entries')
      .whereIn('journal_batch_id', allJournalIds)
      .delete();

    await trx('journal_batches').whereIn('id', allJournalIds).delete();
  }

  if (templateIds.length > 0) {
    await trx('recurring_journal_template_entries')
      .whereIn('template_id', templateIds)
      .delete();

    await trx('recurring_journal_templates')
      .whereIn('id', templateIds)
      .delete();
  }
};
