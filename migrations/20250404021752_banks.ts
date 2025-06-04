import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";
import { addNewBank } from "../src/domains/banks/banks.model";
import bankData from "./data/banks.json";
import { adminUser } from "./20250403184441_users";

const tableName = "banks";

const seedBanks = async function seed(knex: Knex): Promise<void> {
  const adminUserId = adminUser.id;
  if (!adminUserId) throw new Error("adminUserId is required");

  //include admin user id as created_by_id within the bank data
  const data = bankData.map((bank) => ({
    ...bank,
    created_by_id: adminUserId,
    updated_by_id: adminUserId,
  }));

  const res = await addNewBank(data, knex);
  console.log(res);
  if (!res.success) {
    console.error("Error creating banks:", res.error);
    throw new Error(res.message);
  }
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("key").notNullable();
    table.string("name").notNullable();
    table.string("official_name").nullable();

    table.string("swift_code").nullable();
    table.string("local_code").nullable();
    table.specificType("local_code_type", "bank_local_code_type").nullable(); // value: e.g., 'sort_code'

    table.string("website").nullable();

    table.string("logo_url").nullable();
    table.string("logo_key").nullable();

    table
      .uuid("country_id")
      .notNullable()
      .references("id")
      .inTable("countries")
      .onDelete("RESTRICT");

    table
      .uuid("created_by_id")
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    table
      .uuid("updated_by_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    addStandardColumns(table);

    table.unique(["key", "country_id"]);
    table.index(["key", "country_id"]);
    table.index(["name", "country_id"]);
    table.index(["name"]);
    table.index(["country_id"]);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await seedBanks(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
