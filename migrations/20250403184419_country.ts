import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
  preventUpdateOrDelete,
} from "../src/utils/db";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { newCountry, NewCountryInput } from "../src/types/db.type";
import { randomUUID } from "crypto";
import { NODE_ENV } from "../src/config/env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedCountries = async function seed(knex: Knex): Promise<void> {
  const filePath = path.join(__dirname, "data/countries.json");

  try {
    const rawData = await fs.readFile(filePath, "utf-8");
    const jsonData: unknown = JSON.parse(rawData);

    if (!Array.isArray(jsonData)) {
      throw new Error("countries.json must be an array");
    }

    const countries = jsonData as Array<NewCountryInput>;
    const seedData: Array<NewCountryInput> = [];
    let skipped = 0;

    for (const c of countries) {
      const result = newCountry.safeParse(c);

      if (result.success) {
        seedData.push({
          id: result.data.id || randomUUID(),
          code: result.data.code.trim().toUpperCase(),
          name: result.data.name.trim(),
          phone_code: result.data.phone_code,
          ...(result.data.flag && { flag: result.data.flag }),
          ...(result.data.continent && { continent: result.data.continent }),
        });
      } else {
        skipped++;
        console.warn(
          `Skipped invalid country: ${JSON.stringify(c)}`,
          result.error
        );
      }
    }

    if (skipped > 0) {
      throw new Error(`Skipped ${skipped} invalid countries in ${filePath}`);
    }

    if (seedData.length === 0) {
      console.warn(`No valid countries found in ${filePath}`);
    }

    if (seedData.length > 0) {
      await knex.transaction(async (trx) => {
        await trx("country").insert(seedData).onConflict("code").ignore();
      });
    }

    if (NODE_ENV === "local" || NODE_ENV === "docker.dev") {
      console.log(`Seeded ${seedData.length} countries`);
    }
  } catch (error) {
    console.error("Error seeding countries:", error);
    throw error;
  }
};

const tableName = "country";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("code", 3).unique().notNullable();
    table.string("name", 256).notNullable();
    table.string("phone_code", 15).notNullable();
    table.string("flag", 15).nullable();
    table.string("continent", 50).nullable();

    addStandardColumns(table);

    table.index(["code"], "country_code_idx");
    table.index(["name"], "country_name_idx");
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);
  await seedCountries(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
