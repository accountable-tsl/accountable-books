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
// export async function up(knex: Knex): Promise<void> {
//   await knex.raw(
//     `CREATE TYPE company_type AS ENUM ('business', 'accounting_firm', 'individual')`
//   );

//   await knex.raw(
//     `CREATE TYPE user_status AS ENUM ('active', 'inactive', 'disabled', 'invited')`
//   );

//   await knex.raw(
//     `CREATE TYPE user_invite_status AS ENUM ('pending', 'accepted', 'expired')`
//   );

//   await knex.raw(`
//     CREATE TYPE fs_key AS ENUM ('is', 'bs', 'cf');
//   `);

//   await knex.raw(`
//     CREATE TYPE reporting_framework AS ENUM ('ifrs', 'us_gaap');
//   `);

//   await knex.raw(`
//     CREATE TYPE debit_credit AS ENUM ('debit', 'credit');
//   `);

//   await knex.raw(`
//     CREATE TYPE bank_transaction_source AS ENUM ('file_import', 'bank_feed', 'manual_entry');
//   `);

//   await knex.raw(`
//     CREATE TYPE bank_account_type AS ENUM ('other', 'credit_card', 'debit_card', 'savings', 'checkings_current', 'utility');
//   `);

//   await knex.raw(`
//     CREATE TYPE categorization_status AS ENUM ('uncategorized', 'categorized', 'auto_categorized');
//   `);

//   await knex.raw(`
//     CREATE TYPE transaction_source AS ENUM ('bank', 'manual_journal', 'system');
//   `);

//   await knex.raw(`
//     CREATE TYPE journal_status AS ENUM ('draft', 'posted', 'voided');
//   `);

//   await knex.raw(`
//     CREATE TYPE journal_reversal_reason AS ENUM ('auto_reversal', 'voided');
//   `);

//   await knex.raw(`
//     CREATE TYPE recurrence_frequency AS ENUM ('daily', 'weekly', 'monthly', 'yearly');
//   `);

//   await knex.raw(`
//     CREATE TYPE recurring_journal_status AS ENUM ('draft', 'active', 'paused', 'closed');
//   `);

//   await knex.raw(`
//     CREATE TYPE contact_type AS ENUM ('customer', 'supplier', 'employee', 'other');
//   `);

//   await knex.raw(`
//     CREATE TYPE project_status AS ENUM ('in_draft', 'active', 'on_hold', 'completed');
//   `);
// }
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
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TYPE IF EXISTS project_status`);
  await knex.raw(`DROP TYPE IF EXISTS contact_type`);
  await knex.raw(`DROP TYPE IF EXISTS recurring_journal_status`);
  await knex.raw(`DROP TYPE IF EXISTS recurrence_frequency`);
  await knex.raw(`DROP TYPE IF EXISTS journal_reversal_reason`);
  await knex.raw(`DROP TYPE IF EXISTS journal_status`);
  await knex.raw(`DROP TYPE IF EXISTS transaction_source`);
  await knex.raw(`DROP TYPE IF EXISTS categorization_status`);
  await knex.raw(`DROP TYPE IF EXISTS bank_account_type`);
  await knex.raw(`DROP TYPE IF EXISTS bank_transaction_source`);
  await knex.raw(`DROP TYPE IF EXISTS debit_credit`);
  await knex.raw(`DROP TYPE IF EXISTS reporting_framework`);
  await knex.raw(`DROP TYPE IF EXISTS fs_key`);
  await knex.raw(`DROP TYPE IF EXISTS user_invite_status`);
  await knex.raw(`DROP TYPE IF EXISTS user_status`);
  await knex.raw(`DROP TYPE IF EXISTS company_type`);
}
