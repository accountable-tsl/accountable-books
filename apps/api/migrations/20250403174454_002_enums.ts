import type { Knex } from 'knex';

export const createEnumIfNotExists = (typeName: string, values: string[]) => {
  const formattedValues = values.map((v) => `'${v}'`).join(', ');
  return `
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${typeName}') THEN
        CREATE TYPE ${typeName} AS ENUM (${formattedValues});
      END IF;
    END
    $$;
  `;
};

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    createEnumIfNotExists('company_type', [
      'business',
      'accounting_firm',
      'individual',
    ]),
  );

  await knex.raw(
    createEnumIfNotExists('user_invitation_status', [
      'pending',
      'accepted',
      'expired',
      'revoked',
      'rejected',
    ]),
  );
  await knex.raw(createEnumIfNotExists('fs_key', ['is', 'bs', 'cf']));
  await knex.raw(
    createEnumIfNotExists('reporting_framework', ['ifrs', 'us_gaap']),
  );
  await knex.raw(createEnumIfNotExists('debit_credit', ['debit', 'credit']));
  // await knex.raw(
  //   createEnumIfNotExists('bank_transaction_source', [
  //     'file_import',
  //     'bank_feed',
  //     'manual_entry',
  //   ]),
  // );
  await knex.raw(
    createEnumIfNotExists('coa_source', ['user', 'template', 'system']),
  );
  // await knex.raw(
  //   createEnumIfNotExists('categorization_status', [
  //     'uncategorized',
  //     'proposed',
  //     'accepted',
  //     'rejected',
  //     'posted',
  //   ]),
  // );
  // await knex.raw(
  //   createEnumIfNotExists('transaction_source', [
  //     'bank_transaction',
  //     'manual_journal',
  //     'system',
  //   ]),
  // );
  await knex.raw(
    createEnumIfNotExists('journal_status', ['draft', 'posted', 'voided']),
  );
  await knex.raw(
    createEnumIfNotExists('journal_reversal_reason', [
      'auto_reversal',
      'voided',
    ]),
  );
  await knex.raw(
    createEnumIfNotExists('recurrence_frequency', [
      'daily',
      'weekly',
      'monthly',
      'yearly',
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
    createEnumIfNotExists('contact_type', [
      'customer',
      'vendor',
      'employee',
      'contractor',
      'director',
      'owner',
      'government',
      'internal',
      'banker',
      'other',
    ]),
  );
  await knex.raw(
    createEnumIfNotExists('project_status', [
      'in_draft',
      'in_progress',
      'on_hold',
      'completed',
      'cancelled',
    ]),
  );

  await knex.raw(
    createEnumIfNotExists('accounting_basis', [
      'modified_cash_basis',
      'modified_accrual_basis',
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
    createEnumIfNotExists('role_scope', ['platform', 'firm', 'company']),
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
  await knex.raw(`DROP TYPE IF EXISTS categorization_line_split_type`);
  await knex.raw(`DROP TYPE IF EXISTS txn_categorization_source`);
  await knex.raw(`DROP TYPE IF EXISTS contact_status`);
  await knex.raw(`DROP TYPE IF EXISTS role_scope`);
  await knex.raw(`DROP TYPE IF EXISTS token_type`);
  await knex.raw(`DROP TYPE IF EXISTS accounting_basis`);
  await knex.raw(`DROP TYPE IF EXISTS project_status`);
  await knex.raw(`DROP TYPE IF EXISTS contact_type`);
  await knex.raw(`DROP TYPE IF EXISTS recurring_journal_status`);
  await knex.raw(`DROP TYPE IF EXISTS recurrence_frequency`);
  await knex.raw(`DROP TYPE IF EXISTS journal_reversal_reason`);
  await knex.raw(`DROP TYPE IF EXISTS journal_status`);
  // await knex.raw(`DROP TYPE IF EXISTS transaction_source`);
  // await knex.raw(`DROP TYPE IF EXISTS categorization_status`);
  await knex.raw(`DROP TYPE IF EXISTS coa_source`);
  // await knex.raw(`DROP TYPE IF EXISTS bank_transaction_source`);
  await knex.raw(`DROP TYPE IF EXISTS debit_credit`);
  await knex.raw(`DROP TYPE IF EXISTS reporting_framework`);
  await knex.raw(`DROP TYPE IF EXISTS fs_key`);
  await knex.raw(`DROP TYPE IF EXISTS user_invitation_status`);
  await knex.raw(`DROP TYPE IF EXISTS company_type`);
}
