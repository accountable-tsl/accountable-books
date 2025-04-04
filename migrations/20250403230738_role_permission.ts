import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../utils/db";

const tableName = "role_permission";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid("role_id")
      .notNullable()
      .references("id")
      .inTable("role")
      .onDelete("CASCADE");
    table
      .uuid("permission_id")
      .notNullable()
      .references("id")
      .inTable("permission")
      .onDelete("CASCADE");

    table.uuid("granted_at").defaultTo(knex.fn.now());

    table.primary(["role_id", "permission_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable(tableName);
}
