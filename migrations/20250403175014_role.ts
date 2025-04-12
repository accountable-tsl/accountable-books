import type { Knex } from "knex";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
  preventUpdateOrDelete,
} from "../src/utils/db";
import { NewRoleInput, roleName } from "../src/types/db.type";
import { NODE_ENV } from "../src/config/env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedRoles = async function seed(knex: Knex): Promise<void> {
  const filePath = path.join(__dirname, "data/roles.json");

  try {
    const rawData = await fs.readFile(filePath, "utf-8");
    const roles: Array<NewRoleInput> = JSON.parse(rawData);

    // Validate and prepare data
    const seedData = roles.map((role) => ({
      name: roleName.parse(role.name.toLowerCase().trim()),
      description: role.description?.trim(),
    }));

    // Bulk insert
    await knex.transaction(async (trx) => {
      await trx("role").insert(seedData).onConflict("name").ignore();
    });

    if (NODE_ENV === "local" || NODE_ENV === "docker.dev") {
      console.log(`Seeded ${seedData.length} roles from ${filePath}`);
    }
  } catch (error) {
    console.error(`Error seeding roles from ${filePath}:`, error);
    throw error;
  }
};

const tableName = "role";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 50).unique().notNullable(); //super_user, admin, bookkeeper, client
    table.string("description", 512).nullable();

    addStandardColumns(table);
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);
  await seedRoles(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
