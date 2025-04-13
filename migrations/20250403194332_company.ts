import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";

const tableName = "company";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("legal_name", 256).notNullable();
    table.string("display_name", 256).nullable();
    table.string("short_code", 50).unique().notNullable();
    table.string("address", 256).nullable();
    table.specificType("type", "company_type").notNullable();
    table.string("logo_url", 256).nullable();
    table.string("description", 512).nullable();
    table.string("website", 256).nullable();
    table.string("industry", 256).nullable();
    table.string("team_size", 256).nullable();
    table.string("revenue", 256).nullable();
    table.integer("year_end_day").notNullable();
    table.integer("year_end_month").notNullable();
    table.specificType("reporting_framework", "reporting_framework").nullable();
    table.boolean("is_platform").defaultTo(false);

    table
      .uuid("country_id")
      .notNullable()
      .references("id")
      .inTable("country")
      .onDelete("RESTRICT");

    table
      .uuid("reporting_currency_id")
      .notNullable()
      .references("id")
      .inTable("currency")
      .onDelete("RESTRICT");

    table
      .uuid("created_by_id")
      .notNullable()
      .references("id")
      .inTable("user")
      .onDelete("RESTRICT");

    table
      .uuid("assigned_firm_id")
      .nullable()
      .references("id")
      .inTable("company")
      .onDelete("RESTRICT");

    addStandardColumns(table);

    table.index("short_code");
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
