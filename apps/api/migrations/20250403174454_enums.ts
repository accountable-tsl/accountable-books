import type { Knex } from 'knex';

import { createEnumIfNotExists, dropEnumIfExists } from './utils/enums.js';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(createEnumIfNotExists('debit_credit', ['debit', 'credit']));

  await knex.raw(
    createEnumIfNotExists('txn_categorization_source', [
      'rule',
      'ml',
      'ml_heuristic',
      'manual',
    ]),
  );

  await knex.raw(
    createEnumIfNotExists('categorization_line_split_type', [
      'amount',
      'percentage',
      'remainder',
    ]),
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(dropEnumIfExists('categorization_line_split_type'));
  await knex.raw(dropEnumIfExists('txn_categorization_source'));
  await knex.raw(dropEnumIfExists('debit_credit'));
}
