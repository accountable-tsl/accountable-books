import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";

const tableName = "ledger_transactions";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.timestamp("date", { useTz: true }).notNullable();
    table.specificType("source", "transaction_source").notNullable();
    table.string("description", 512).nullable();
    table.string("reference").nullable();
    table.string("note", 1000).nullable();

    table.uuid("contact_id").nullable().references("id").inTable("contacts");

    table.uuid("bank_transaction_id").nullable();
    table.date("bank_transaction_date").nullable();

    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("companies");
    table.uuid("created_by_id").notNullable().references("id").inTable("users");
    table.uuid("updated_by_id").nullable().references("id").inTable("users");

    addStandardColumns(table);
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
