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
import { NODE_ENV } from "../src/config/env";
import { NewPermissionInput } from "../src/types/db.type";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedPermissions = async function seed(knex: Knex): Promise<void> {
  const filePath = path.join(__dirname, "data/permissions.json");

  try {
    const rawData = await fs.readFile(filePath, "utf-8");
    const permissions: Array<NewPermissionInput> = JSON.parse(rawData);

    const seedData = permissions.map((p) => ({
      key: p.key,
      action: p.action,
      resource: p.resource,
      label: p.label,
      description: p.description,
    }));

    await knex.transaction(async (trx) => {
      await trx("permission")
        .insert(seedData)
        .onConflict(["action", "resource"])
        .ignore();
    });

    if (NODE_ENV === "local" || NODE_ENV === "docker.dev") {
      console.log(`Seeded ${seedData.length} permissions from ${filePath}`);
    }
  } catch (error) {
    console.error(`Error seeding permissions from ${filePath}:`, error);
    throw error;
  }
};

const tableName = "permission";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("key", 256).notNullable(); //e.g, "view_users", "categorize_transactions"
    table.string("action", 256).notNullable(); //The verb or operation	view, edit, create, delete, categorise
    table.string("resource", 256).notNullable(); // The thing being accessed	users, transactions, companies, reports
    table.string("description", 512).nullable();
    table.string("label", 256).notNullable();

    addStandardColumns(table);

    table.unique(["action", "resource"], {
      indexName: "permission_action_resource_unique",
    });
    table.unique(["key"], { indexName: "permission_key_unique" });

    table.index(["action", "resource"], "permission_action_resource_idx");
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);
  await seedPermissions(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
