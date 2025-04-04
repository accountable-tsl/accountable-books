import { table } from "console";
import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../utils/db";

const tableName = "account_type";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 256).unique().notNullable();
    table.string("description").nullable();
    table
      .uuid("account_element_id")
      .notNullable()
      .references("id")
      .inTable("account_element")
      .onDelete("RESTRICT");

    addStandardColumns(table);

    table.index(["account_element_id"], "account_type_element_idx");
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTable(tableName);
}
