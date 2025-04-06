import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../utils/db";

const tableName = "user_company_role";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("user")
      .onDelete("CASCADE");

    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("company")
      .onDelete("CASCADE");

    table
      .uuid("role_id")
      .notNullable()
      .references("id")
      .inTable("role")
      .onDelete("CASCADE");

    table
      .timestamp("joined_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    addStandardColumns(table);

    table.primary(["user_id", "company_id"]);
    table.index(["user_id", "company_id"], "user_company_composite_idx");
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTable("user_company");
}
