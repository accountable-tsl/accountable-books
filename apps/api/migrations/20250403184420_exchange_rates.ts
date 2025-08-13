import type { Knex } from "knex";
import path from "path";
import fs from "fs";
import csv from "csv-parser";
import { fileURLToPath } from "url";
import { NODE_ENV } from "../src/config/env";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
  preventUpdateOrDelete,
} from "../src/utils/db";
import { NewExchangeRateInput } from "../src/domains/exchangeRates/exchangeRate.types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedExchangeRates = async function seed(knex: Knex): Promise<void> {
  const filePath = path.join(__dirname, "data/ng_exrates.csv");
  const exchangeRates: NewExchangeRateInput[] = [];
  let skipped = 0;

  // Read and parse CSV
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data: Record<string, string>) => {
        try {
          if (
            data.date &&
            data.from_currency_id &&
            data.to_currency_id &&
            data.rate
          ) {
            exchangeRates.push({
              date: new Date(data.date),
              from_currency_id: data.from_currency_id.trim(),
              to_currency_id: data.to_currency_id.trim(),
              rate: Number(data.rate),
            });
          } else {
            skipped++;
            console.warn(`Skipped invalid row: ${JSON.stringify(data)}`);
          }
        } catch (e) {
          skipped++;
          console.warn(`Invalid row skipped: ${JSON.stringify(data)}`, e);
        }
      })
      .on("error", reject)
      .on("end", resolve);
  });

  if (exchangeRates.length > 0) {
    await knex.transaction(async (trx) => {
      const chunkSize = 1000;
      for (let i = 0; i < exchangeRates.length; i += chunkSize) {
        await trx("exchange_rates")
          .insert(exchangeRates.slice(i, i + chunkSize))
          .onConflict(["date", "from_currency_id", "to_currency_id"])
          .ignore();
      }
    });
  }

  if (NODE_ENV === "local" || NODE_ENV === "docker") {
    console.log(
      `Seeded ${exchangeRates.length} exchange rates, skipped ${skipped} from ${filePath}`
    );
  }
};

const tableName = "exchange_rates";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v7()"));
    table.timestamp("date", { useTz: true }).notNullable();
    table
      .uuid("from_currency_id")
      .notNullable()
      .references("id")
      .inTable("currencies")
      .onDelete("RESTRICT");
    table
      .uuid("to_currency_id")
      .notNullable()
      .references("id")
      .inTable("currencies")
      .onDelete("RESTRICT");

    table.decimal("rate", 32, 10).notNullable();

    addStandardColumns(table);

    table.index(
      ["from_currency_id", "to_currency_id"],
      "exchange_rates_currency_idx"
    );
    table.index(["date"], "exchange_rates_date_idx");
    table.unique(["date", "from_currency_id", "to_currency_id"], {
      indexName: "exchange_rates_date_currency_unique",
    });
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);
  await seedExchangeRates(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
