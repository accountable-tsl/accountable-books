import type { Knex } from 'knex';

import type { AccountElementKey } from '../../../bootstrap/catalogs/accounting/account-elements.js';

/**
 * One distinct account touched by posted activity in a period, with its taxonomy.
 * Read live from `ledger_entries` (not the materialized `gl_period_balances`) so
 * the close-readiness checks that depend on it are always accurate even when the
 * GL balance materialization is stale.
 */
export type AccountActivityRow = {
  coa_id: string;
  account_type_key: string;
  account_element_key: AccountElementKey;
  account_type_label_role: string;
};

/**
 * The set of accounts with posted activity in [startDate, endDate], grouped to
 * one row per COA. Shared by the live account-activity reviews and the
 * period-level findings so both classify activity the same way.
 */
export async function getAccountActivity({
  queryable,
  companyId,
  startDate,
  endDate,
}: {
  queryable: Knex;
  companyId: string;
  startDate: string;
  endDate: string;
}): Promise<AccountActivityRow[]> {
  return await queryable('ledger_entries as le')
    .join('ledger_transactions as lt', function () {
      this.on('lt.id', 'le.ledger_transaction_id').andOn(
        'lt.company_id',
        'le.company_id',
      );
    })
    .join('coa as c', function () {
      this.on('c.id', 'le.coa_id').andOn('c.company_id', 'le.company_id');
    })
    .join('account_types as at', 'at.id', 'c.account_type_id')
    .join('account_elements as ae', 'ae.id', 'at.account_element_id')
    .where('le.company_id', companyId)
    .where('lt.status', 'posted')
    .whereBetween('le.fs_date', [startDate, endDate])
    .groupBy('c.id', 'at.key', 'ae.key', 'at.label_role')
    .select(
      'c.id as coa_id',
      'at.key as account_type_key',
      'ae.key as account_element_key',
      'at.label_role as account_type_label_role',
    );
}
