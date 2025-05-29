import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";

const tableName = "bank_transaction_batches";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .timestamp("import_date", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp("start_date", { useTz: true }).notNullable();
    table.timestamp("end_date", { useTz: true }).notNullable();

    table.decimal("balance_before", 20, 10).notNullable();
    table.decimal("balance_after", 20, 10).notNullable();

    table.specificType("source", "bank_transaction_source").notNullable();

    table
      .uuid("bank_account_id")
      .notNullable()
      .references("id")
      .inTable("bank_accounts")
      .onDelete("RESTRICT");

    table
      .uuid("created_by_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("RESTRICT");

    table
      .uuid("updated_by_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    addStandardColumns(table);

    table.index(["bank_account_id"], "batch_bank_account_idx");
    table.index(["start_date", "end_date"], "batch_date_range_idx");
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
