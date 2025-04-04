import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../utils/db";

const tableName = "permission";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 256).notNullable(); //e.g, "view_users", "categorize_transactions"
    table.string("description", 512).nullable();
    table.string("action", 256).notNullable(); //The verb or operation	view, edit, create, delete, categorise
    table.string("resource", 256).notNullable(); // The thing being accessed	users, transactions, companies, reports

    addStandardColumns(table);

    table.unique(["action", "resource"], "permission_action_resource_unique");
    table.index(["action", "resource"], "permission_action_resource_idx");
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTable(tableName);
}
