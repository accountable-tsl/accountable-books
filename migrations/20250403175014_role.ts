import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../utils/db";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("role", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 50).unique().notNullable(); //super_user, admin, bookkeeper, client
    table.text("description").nullable();

    addStandardColumns(table);
  });

  // Create the update timestamp function
  await createUpdateTimestampTrigger(knex, "role");
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, "role");
  await knex.schema.dropTable("role");
}
