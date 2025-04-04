import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../utils/db";

const tableName = "company";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 256).notNullable();
    table.string("short_code", 50).unique().notNullable();
    table.string("website", 256).nullable();
    table.string("industry", 256).nullable();
    table.string("team_size", 256).nullable();
    table.string("revenue", 256).nullable();
    table.integer("year_end_day").notNullable();
    table.integer("year_end_month").notNullable();

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
      .onDelete("SET NULL");

    addStandardColumns(table);

    table.index("short_code");
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTable(tableName);
}
