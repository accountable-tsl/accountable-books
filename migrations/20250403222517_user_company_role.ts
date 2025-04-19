import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";
import { adminUser } from "./20250403184441_user";
import { NODE_ENV } from "../src/config/env";
import { createPlatformCompany } from "./20250403194332_company";

const assignAdminRole = async (knex: Knex) => {
  const platformCompany = await createPlatformCompany(knex);

  const role = await knex("role").where({ name: "admin" }).first();
  if (!role) {
    throw new Error("Admin role not found");
  }

  const existing = await knex("user_company_role")
    .where({
      user_id: platformCompany.created_by_id,
      company_id: platformCompany.id,
      role_id: role.id,
    })
    .first();

  if (existing) {
    console.log("Admin role already assigned to platform user.");
    return;
  }

  await knex("user_company_role").insert({
    user_id: platformCompany.created_by_id,
    company_id: platformCompany.id,
    role_id: role.id,
  });
  console.log("Assigned admin role to platform company creator.");
};

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
  await assignAdminRole(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
