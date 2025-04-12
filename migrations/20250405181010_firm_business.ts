import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";

// This table maps which business is assigned to which accounting firm. Think of it like:
// Business A is being managed by Accounting Firm X.
// Only one firm per business is allowed, but a firm can manage many businesses.

const tableName = "firm_business";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table
      .uuid("business_id")
      .notNullable()
      .references("id")
      .inTable("company")
      .onDelete("CASCADE");

    table
      .uuid("accounting_firm_id")
      .notNullable()
      .references("id")
      .inTable("company")
      .onDelete("CASCADE");

    addStandardColumns(table);

    table.unique(["business_id"]);
    table.index(["accounting_firm_id"], "firm_business_firm_idx");
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
