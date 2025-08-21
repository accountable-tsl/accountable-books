import type { Knex } from 'knex';
import type { MarkFn, SeedCtx } from '../engine/helpers';

// Stub: Only generates transactions if explicitly enabled via ctx.includeTransactions.
export async function up(knex: Knex, ctx: SeedCtx, mark: MarkFn) {
  if (!ctx || !ctx.includeTransactions) return; // opt-in only

  const { companyShortCode } = ctx;
  const company = await knex('companies')
    .select('id')
    .where({ short_code: companyShortCode })
    .first();
  if (!company?.id) throw new Error('Company not found for bank-transactions');

  // Intentionally left minimal: realistic generation can be added later using CSV import or rules.
  // For now, we skip actual inserts to avoid interfering with partitioned table setup.
  // Example extension point:
  // - Load bank_accounts for the company
  // - Generate a month of synthetic credits/debits per account
  // - Insert into bank_transactions with proper composite key (id, date)
}
