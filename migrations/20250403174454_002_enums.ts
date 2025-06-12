import type { Knex } from "knex";

const createEnumIfNotExists = (typeName: string, values: string[]) => {
  const formattedValues = values.map((v) => `'${v}'`).join(", ");
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
    createEnumIfNotExists("company_type", [
      "business",
      "accounting_firm",
      "individual",
    ])
  );
  await knex.raw(
    createEnumIfNotExists("user_status", [
      "active",
      "inactive",
      "disabled",
      "invited",
    ])
  );
  await knex.raw(
    createEnumIfNotExists("user_invite_status", [
      "pending",
      "accepted",
      "expired",
    ])
  );
  await knex.raw(createEnumIfNotExists("fs_key", ["is", "bs", "cf"]));
  await knex.raw(
    createEnumIfNotExists("reporting_framework", ["ifrs", "us_gaap"])
  );
  await knex.raw(createEnumIfNotExists("debit_credit", ["debit", "credit"]));
  await knex.raw(
    createEnumIfNotExists("bank_transaction_source", [
      "file_import",
      "bank_feed",
      "manual_entry",
    ])
  );
  await knex.raw(
    createEnumIfNotExists("bank_account_type", [
      "other",
      "credit_card",
      "debit_card",
      "savings",
      "checkings_current",
      "utility",
    ])
  );
  await knex.raw(
    createEnumIfNotExists("coa_source", ["user", "template", "system"])
  );
  await knex.raw(
    createEnumIfNotExists("categorization_status", [
      "uncategorized",
      "categorized",
      "auto_categorized",
    ])
  );
  await knex.raw(
    createEnumIfNotExists("transaction_source", [
      "bank",
      "manual_journal",
      "system",
    ])
  );
  await knex.raw(
    createEnumIfNotExists("journal_status", ["draft", "posted", "voided"])
  );
  await knex.raw(
    createEnumIfNotExists("journal_reversal_reason", [
      "auto_reversal",
      "voided",
    ])
  );
  await knex.raw(
    createEnumIfNotExists("recurrence_frequency", [
      "daily",
      "weekly",
      "monthly",
      "yearly",
    ])
  );
  await knex.raw(
    createEnumIfNotExists("recurring_journal_status", [
      "draft",
      "active",
      "paused",
      "closed",
    ])
  );
  await knex.raw(
    createEnumIfNotExists("contact_type", [
      "customer",
      "supplier",
      "employee",
      "other",
    ])
  );
  await knex.raw(
    createEnumIfNotExists("project_status", [
      "in_draft",
      "active",
      "on_hold",
      "completed",
    ])
  );

  await knex.raw(
    createEnumIfNotExists("accounting_basis", [
      "modified_cash_basis",
      "modified_accrual_basis",
    ])
  );

  await knex.raw(
    createEnumIfNotExists("onboarding_status", [
      "not_started",
      "email_verified",
      "company_vitals_needed",
      "first_bank_account_needed",
      "onboarding_complete",
    ])
  );

  await knex.raw(
    createEnumIfNotExists("bank_local_code_type", [
      "sort_code",
      "routing",
      "bank_code",
      "ifsc",
      "blz",
      "zengin_code",
      "cnaps",
    ])
  );

  await knex.raw(
    createEnumIfNotExists("bank_feed_provider_status", [
      "active",
      "inactive",
      "deprecated",
    ])
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TYPE IF EXISTS bank_feed_provider_status`);
  await knex.raw(`DROP TYPE IF EXISTS bank_local_code_type`);
  await knex.raw(`DROP TYPE IF EXISTS onboarding_status`);
  await knex.raw(`DROP TYPE IF EXISTS accounting_basis`);
  await knex.raw(`DROP TYPE IF EXISTS project_status`);
  await knex.raw(`DROP TYPE IF EXISTS contact_type`);
  await knex.raw(`DROP TYPE IF EXISTS recurring_journal_status`);
  await knex.raw(`DROP TYPE IF EXISTS recurrence_frequency`);
  await knex.raw(`DROP TYPE IF EXISTS journal_reversal_reason`);
  await knex.raw(`DROP TYPE IF EXISTS journal_status`);
  await knex.raw(`DROP TYPE IF EXISTS transaction_source`);
  await knex.raw(`DROP TYPE IF EXISTS categorization_status`);
  await knex.raw(`DROP TYPE IF EXISTS coa_source`);
  await knex.raw(`DROP TYPE IF EXISTS bank_account_type`);
  await knex.raw(`DROP TYPE IF EXISTS bank_transaction_source`);
  await knex.raw(`DROP TYPE IF EXISTS debit_credit`);
  await knex.raw(`DROP TYPE IF EXISTS reporting_framework`);
  await knex.raw(`DROP TYPE IF EXISTS fs_key`);
  await knex.raw(`DROP TYPE IF EXISTS user_invite_status`);
  await knex.raw(`DROP TYPE IF EXISTS user_status`);
  await knex.raw(`DROP TYPE IF EXISTS company_type`);
}
