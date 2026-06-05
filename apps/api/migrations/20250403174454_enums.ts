import type { Knex } from 'knex';

import { createEnumIfNotExists, dropEnumIfExists } from './utils/enums.js';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    createEnumIfNotExists('user_invitation_status', [
      'pending',
      'accepted',
      'expired',
      'revoked',
      'rejected',
    ]),
  );
  await knex.raw(createEnumIfNotExists('debit_credit', ['debit', 'credit']));
  await knex.raw(
    createEnumIfNotExists('coa_source', ['user', 'template', 'system']),
  );
  await knex.raw(
    createEnumIfNotExists('journal_status', ['draft', 'posted', 'voided']),
  );

  await knex.raw(
    createEnumIfNotExists('recurrence_frequency', [
      'daily',
      'weekly',
      'monthly',
      'quarterly',
      'yearly',
      'custom',
    ]),
  );
  await knex.raw(
    createEnumIfNotExists('recurring_journal_status', [
      'draft',
      'active',
      'paused',
      'closed',
    ]),
  );
  await knex.raw(
    createEnumIfNotExists('token_type', [
      'email_verification',
      'user_invite',
      'password_reset',
    ]),
  );

  await knex.raw(
    createEnumIfNotExists('contact_status', ['active', 'inactive']),
  );

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
  await knex.raw(dropEnumIfExists('contact_status'));
  await knex.raw(dropEnumIfExists('token_type'));
  await knex.raw(dropEnumIfExists('recurring_journal_status'));
  await knex.raw(dropEnumIfExists('recurrence_frequency'));
  await knex.raw(dropEnumIfExists('journal_status'));
  await knex.raw(dropEnumIfExists('coa_source'));
  await knex.raw(dropEnumIfExists('debit_credit'));
  await knex.raw(dropEnumIfExists('user_invitation_status'));
}
