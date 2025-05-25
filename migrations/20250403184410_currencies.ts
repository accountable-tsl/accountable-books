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
import { currencyWithId, NewCurrencyWithId } from "../src/core/types/db.type";
import { NODE_ENV } from "../src/config/env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tableName = "currencies";

export async function seedCurrencies(knex: Knex): Promise<void> {
  const filePath = path.join(__dirname, "data/currencies.json");

  try {
    const rawData = await fs.readFile(filePath, "utf-8");
    const jsonData: unknown = JSON.parse(rawData);

    if (!Array.isArray(jsonData)) {
      throw new Error("currencies.json must be an array");
    }

    const currencies = jsonData as Array<NewCurrencyWithId>;
    const seedData: Array<NewCurrencyWithId> = [];
    let skipped = 0;

    for (const currency of currencies) {
      const result = currencyWithId.safeParse(currency);

      if (result.success) {
        seedData.push({
          id: result.data.id,
          name: result.data.name.trim(),
          code: result.data.code.trim().toUpperCase(),
          symbol: result.data.symbol.trim(),
        });
      } else {
        skipped++;
        console.warn(
          `Skipped invalid currency: ${JSON.stringify(currency)}`,
          result.error
        );
      }
    }

    if (skipped > 0) {
      throw new Error(`Skipped ${skipped} invalid currencies from ${filePath}`);
    }

    if (seedData.length === 0) {
      console.warn(`No valid currencies to seed from ${filePath}`);
    }

    if (seedData.length > 0) {
      await knex.transaction(async (trx) => {
        await trx(tableName).insert(seedData).onConflict("code").ignore();
      });
    }
    if (NODE_ENV === "local" || NODE_ENV === "docker") {
      console.log(`Seeded ${seedData.length} currencies`);
    }
  } catch (error) {
    console.error(`Error seeding currencies from ${filePath}:`, error);
    throw error;
  }
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("code", 4).unique().notNullable(); //ISO Currency Codes
    table.string("name", 50).unique().notNullable();
    table.string("symbol", 5).notNullable();

    addStandardColumns(table);

    table.index(["code"], "currency_code_idx");
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);

  await seedCurrencies(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
