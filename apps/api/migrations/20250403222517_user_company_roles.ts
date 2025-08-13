import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";
import { createPlatformCompany } from "./20250403194332_companies";
import { getRoleId, loadRoles } from "../src/domains/roles/roles.model";

export const assignAdminRole = async (knex: Knex) => {
  const platformCompany = await createPlatformCompany(knex);

  const role = await knex("roles").where("key", "super_admin").first();
  const roleId = role?.id;
  if (!roleId) {
    throw new Error("Admin role not found");
  }

  const existing = await knex(tableName)
    .where({
      user_id: platformCompany.created_by_id,
      company_id: platformCompany.id,
      role_id: roleId,
    })
    .first();

  if (existing) {
    console.log("Admin role already assigned to platform user.");
    return;
  }

  await knex(tableName).insert({
    user_id: platformCompany.created_by_id,
    company_id: platformCompany.id,
    role_id: roleId,
    created_by_id: platformCompany.created_by_id,
  });
  console.log("Assigned admin role to platform company creator.");
};

const tableName = "user_company_roles";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("companies")
      .onDelete("CASCADE");

    table
      .uuid("role_id")
      .notNullable()
      .references("id")
      .inTable("roles")
      .onDelete("CASCADE");

    table
      .uuid("updated_by_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table
      .uuid("created_by_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("RESTRICT");

    addStandardColumns(table);

    table.primary(["user_id", "company_id"]);
    table.index(["user_id", "company_id"], "user_company_composite_idx");
  });

  await createUpdateTimestampTrigger(knex, tableName);
  // await assignAdminRole(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
