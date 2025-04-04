import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../utils/db";

const tableName = "bank_account";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("display_name").notNullable();
    table.specificType("account_type", "bank_account_type").notNullable();
    table.string("account_number").notNullable();

    table
      .uuid("bank_id")
      .notNullable()
      .references("id")
      .inTable("bank")
      .onDelete("RESTRICT");

    table
      .uuid("currency_id")
      .notNullable()
      .references("id")
      .inTable("currency")
      .onDelete("RESTRICT");

    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("company")
      .onDelete("RESTRICT");

    table
      .uuid("coa_id")
      .notNullable()
      .references("id")
      .inTable("coa")
      .onDelete("RESTRICT");

    table
      .uuid("created_by_id")
      .notNullable()
      .references("id")
      .inTable("user")
      .onDelete("RESTRICT");

    addStandardColumns(table);

    table.index(["company_id", "bank_id"], "bank_account_company_bank_index");
    table.unique(["company_id", "account_number", "bank_id"]);
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTable(tableName);
}
