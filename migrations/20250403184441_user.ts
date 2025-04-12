import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";

const tableName = "user";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("firstname", 256).notNullable();
    table.string("lastname", 256).nullable();

    table.string("email", 254).unique().notNullable();
    table.string("password_hash", 256).nullable();
    table.string("phone_number", 20).nullable();
    table.string("avatar_url").nullable();
    table.specificType("status", "user_status").notNullable();

    table.specificType("invite_status", "user_invite_status").nullable();

    table.boolean("email_verified").defaultTo(false).notNullable();
    table.string("email_verification_token_hash", 256).nullable();
    table.timestamp("email_verification_expiry", { useTz: true }).nullable();
    table.timestamp("email_verified_at", { useTz: true }).nullable();

    table.string("invite_token_hash", 256).nullable();
    table
      .uuid("invited_by_id")
      .nullable()
      .references("id")
      .inTable("user")
      .onDelete("SET NULL");
    table.timestamp("invited_at", { useTz: true }).nullable();
    table.timestamp("invite_expiry", { useTz: true }).nullable();

    table.integer("failed_login_attempts").defaultTo(0).notNullable();
    table.timestamp("last_login_at", { useTz: true }).nullable();
    table.timestamp("last_failed_login_at", { useTz: true }).nullable();

    table.string("auth_provider").defaultTo("local"); // 'local', 'google', 'apple', etc.
    table.string("provider_user_id").nullable();

    addStandardColumns(table);

    table.index(["email", "status"]);
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
