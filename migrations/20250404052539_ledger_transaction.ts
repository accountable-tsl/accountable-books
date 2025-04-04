import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../utils/db";

const tableName = "ledger_transaction";
export async function up(knex: Knex): Promise<void> {
  knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.timestamp("date", { useTz: true }).notNullable();
    table.specificType("source", "transaction_source").notNullable();
    table.string("description").nullable();
    table.string("reference").nullable();
    table.string("notes").nullable();

    table.uuid("contact_id").nullable().references("id").inTable("contact");
    table
      .uuid("bank_transaction_id")
      .nullable()
      .references("id")
      .inTable("bank_transaction");
    table
      .uuid("bank_transaction_date")
      .nullable()
      .references("date")
      .inTable("bank_transaction");
    table.uuid("company_id").notNullable().references("id").inTable("company");
    table.uuid("created_by_id").notNullable().references("id").inTable("user");
    table.uuid("updated_by_id").nullable().references("id").inTable("user");

    addStandardColumns(table);
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTable(tableName);
}
