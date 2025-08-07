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
    createEnumIfNotExists("user_invitation_status", [
      "pending",
      "accepted",
      "expired",
      "revoked",
      "rejected",
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
      "in_progress",
      "on_hold",
      "completed",
      "cancelled",
    ])
  );

  await knex.raw(
    createEnumIfNotExists("accounting_basis", [
      "modified_cash_basis",
      "modified_accrual_basis",
    ])
  );

  await knex.raw(
    createEnumIfNotExists("bank_local_code_type", [
      "sort_code",
      "routing",
      "bank_code",
      "nip_code",
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

  await knex.raw(
    createEnumIfNotExists("bank_account_connection_status", [
      "active",
      "revoked",
      "pending",
      "error",
    ])
  );

  await knex.raw(
    createEnumIfNotExists("business_or_personal_account", [
      "business",
      "personal",
    ])
  );

  await knex.raw(
    createEnumIfNotExists("token_type", [
      "email_verification",
      "user_invite",
      "password_reset",
    ])
  );

  await knex.raw(
    createEnumIfNotExists("role_scope", ["platform", "firm", "company"])
  );

  await knex.raw(
    createEnumIfNotExists("contact_status", ["active", "inactive"])
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TYPE IF EXISTS business_or_personal_account`);
  await knex.raw(`DROP TYPE IF EXISTS token_type`);
  await knex.raw(`DROP TYPE IF EXISTS business_or_personal_account`);
  await knex.raw(`DROP TYPE IF EXISTS bank_account_connection_status`);
  await knex.raw(`DROP TYPE IF EXISTS bank_feed_provider_status`);
  await knex.raw(`DROP TYPE IF EXISTS bank_local_code_type`);
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
  await knex.raw(`DROP TYPE IF EXISTS user_invitation_status`);
  await knex.raw(`DROP TYPE IF EXISTS company_type`);
}
