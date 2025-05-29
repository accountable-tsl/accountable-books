import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";
import { createPlatformCompany } from "./20250403194332_companies";
import { createPlatformFirm } from "./20250403194335_accounting_firms";

const tableName = "firms_companies";

// This table maps which business is assigned to which accounting firm. Think of it like:
// Business A is being managed by Accounting Firm X.
// Only one firm per business is allowed, but a firm can manage many businesses.
const insertPlatformFirmCompany = async (knex: Knex) => {
  const platformCompany = await createPlatformCompany(knex);
  const platformAccountingFirm = await createPlatformFirm(knex);

  if (!platformCompany?.id || !platformAccountingFirm?.id) {
    throw new Error("Invalid platform company or accounting firm returned");
  }

  const exists = await knex(tableName)
    .where({
      company_id: platformCompany.id,
      accounting_firm_id: platformAccountingFirm.id,
    })
    .first();

  if (exists) {
    console.log("Platform firm-company link already exists.");
    return;
  }

  await knex(tableName).insert({
    company_id: platformCompany.id,
    accounting_firm_id: platformAccountingFirm.id,
  });

  await knex("companies")
    .where({ id: platformCompany.id })
    .update({ assigned_firm_id: platformAccountingFirm.id });

  console.log("Linked platform company to platform accounting firm.");
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("companies")
      .onDelete("CASCADE");

    table
      .uuid("accounting_firm_id")
      .notNullable()
      .references("company_id")
      .inTable("accounting_firms")
      .onDelete("CASCADE");

    addStandardColumns(table);

    table.unique(["company_id"]);
    table.index(["accounting_firm_id"], "firm_company_firm_idx");
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await insertPlatformFirmCompany(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
