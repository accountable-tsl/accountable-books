import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../utils/db";

const tableName = "coa_template";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("template_name", 256).notNullable();
    table.string("name", 256).notNullable();
    table.string("code", 256).nullable();
    table.string("description", 512).nullable();

    table
      .uuid("account_type_id")
      .notNullable()
      .references("id")
      .inTable("account_type")
      .onDelete("RESTRICT");

    addStandardColumns(table);
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTable(tableName);
}
