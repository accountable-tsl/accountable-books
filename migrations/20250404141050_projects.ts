import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";

const tableName = "projects";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v7()"));
    table.string("name").notNullable();
    table.string("code").nullable();
    table.string("description", 512).nullable();
    table
      .specificType("status", "project_status")
      .defaultTo("in_draft")
      .notNullable();
    table
      .uuid("contact_id")
      .nullable()
      .references("id")
      .inTable("contacts")
      .onDelete("SET NULL");

    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("companies")
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

    table.unique(["company_id", "name"]);
    table.unique(["company_id", "code"]);
    table.index(["company_id", "status"], "project_company_status_idx");
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
