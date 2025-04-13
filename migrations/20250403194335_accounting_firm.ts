import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";

const tableName = "accounting_firm";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("company_id")
      .unique()
      .notNullable()
      .references("id")
      .inTable("company")
      .onDelete("RESTRICT"); // Company that is the accounting firm's HQ
    table.string("legal_name", 256).notNullable();
    table.string("display_name", 256).notNullable();
    table.string("short_code", 50).unique().notNullable();
    table.string("firm_type", 50).nullable(); //freelancer, ca / cpa, tax preparer, international
    table.string("firm_size", 50).nullable();
    table.string("website", 256).nullable();
    table.string("revenue", 50).nullable();
    table.string("logo_url", 256).nullable();
    table.boolean("is_platform").defaultTo(false);

    table
      .uuid("country_id")
      .notNullable()
      .references("id")
      .inTable("country")
      .onDelete("RESTRICT");

    table
      .uuid("created_by_id")
      .notNullable()
      .references("id")
      .inTable("user")
      .onDelete("RESTRICT");

    addStandardColumns(table);
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
