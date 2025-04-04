import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../utils/db";

const tableName = "user";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("firstname", 100).notNullable();
    table.string("lastname", 100).nullable();
    table.string("email", 256).unique().notNullable();
    table.string("password").notNullable();
    table.string("phone_number", 50).nullable();
    table
      .specificType("status", "user_status")
      .defaultTo("active")
      .notNullable();

    table.string("profile_image").nullable();

    addStandardColumns(table);

    table.index(["email", "status"]);
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTable(tableName);
}
