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

  // //include admin user id as created_by_id within the bank data
  // const data = bankData.map((bank) => ({
  //   ...bank,
  //   created_by_id: adminUserId,
  //   updated_by_id: adminUserId,
  // }));

  // data.forEach((bank, index) => {
  //   if (!bank.key || !bank.country_id || !bank.display_name) {
  //     console.log(bank);
  //     throw new Error(`Bank at index ${index} is missing a required field`);
  //   }
  // });

  const res = await addNewBank(bankData, adminUserId, knex);
  if (!res.success) {
    console.error("Error creating banks:", res.error);
    throw new Error(res.message);
  }

  console.log(`Successfully created ${res.data.length} banks`);
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("key").notNullable();
    table.string("display_name").notNullable();
    table.string("official_name").nullable();

    table.string("swift_code").nullable();
    table.string("local_code").nullable(); // We use NIP code for Nigeria
    table.specificType("local_code_type", "bank_local_code_type").nullable(); // value: e.g., 'sort_code'
    table.string("secondary_reference").nullable();

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
    table.index(["display_name", "country_id"]);
    table.index(["display_name"]);
    table.index(["country_id"]);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await seedBanks(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
