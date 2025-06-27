import type { Knex } from "knex";

const tableName = "user_invitations";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    // TODO: When handling this, remember to create background job
    // TODO: via BullMQ or cron to mark invitations as expired where status is pending and expires_at is in the past
    // TODO: Also make sure invite expiry from here is what is inserted into tokens table so we don't have lags
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("email", 254).unique().notNullable();
    table
      .uuid("invited_by")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

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
      .onDelete("RESTRICT");

    table
      .specificType("status", "user_invitation_status")
      .notNullable()
      .defaultTo("pending");
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("accepted_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable();
    table.timestamp("updated_at", { useTz: true }).notNullable();

    table.index(["status", "expires_at"], "user_invite_status_expiry_idx");
    table.index(["expires_at"], "tokens_expiry_idx");
  });

  // Partial unique index: one pending invite per email per company
  await knex.raw(`
    CREATE UNIQUE INDEX user_invites_unique_pending
    ON user_invitations (email, company_id)
    WHERE status = 'pending'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable(tableName);
}
