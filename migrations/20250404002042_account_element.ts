import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../utils/db";

const tableName = "account_element";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("key", 64).unique().notNullable();
    table.string("label", 256).notNullable();
    table.specificType("default_side", "debit_credit").notNullable();
    table.string("description", 512).nullable();

    table.uuid("parent_id").nullable().references("id").inTable(tableName);
    table
      .uuid("financial_statement_id")
      .notNullable()
      .references("id")
      .inTable("financial_statement")
      .onDelete("RESTRICT");

    addStandardColumns(table);

    table.index(["parent_id"], "account_category_parent_idx");
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTable(tableName);
}
