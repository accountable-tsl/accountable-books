import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../utils/db";

const tableName = "exchange_rate";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.timestamp("date", { useTz: true }).notNullable();
    table
      .uuid("from_currency_id")
      .notNullable()
      .references("id")
      .inTable("currency")
      .onDelete("RESTRICT");
    table
      .uuid("to_currency_id")
      .notNullable()
      .references("id")
      .inTable("currency")
      .onDelete("RESTRICT");

    table.decimal("rate", 20, 10).notNullable();

    addStandardColumns(table);

    table.index(
      ["from_currency_id", "to_currency_id"],
      "exchange_rate_currency_idx"
    );
    table.index(["date"], "exchange_rate_date_idx");
    table.unique(
      ["date", "from_currency_id", "to_currency_id"],
      "exchange_rate_date_currency_unique"
    );
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTable(tableName);
}
