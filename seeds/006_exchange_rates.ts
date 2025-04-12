import type { Knex } from "knex";
import path from "path";
import fs from "fs";
import csv from "csv-parser";
import { fileURLToPath } from "url";
import Decimal from "decimal.js";
import { NewExchangeRateInput } from "../types/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function seed(knex: Knex): Promise<void> {
  const filePath = path.join(__dirname, "data/ng_exrates.csv");
  const exchangeRates: NewExchangeRateInput[] = [];

  // Read and parse CSV
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data: Record<string, string>) => {
        if (
          data.date &&
          data.fromCurrencyId &&
          data.toCurrencyId &&
          data.rate
        ) {
          try {
            exchangeRates.push({
              date: new Date(data.date),
              from_currency_id: data.fromCurrencyId,
              to_currency_id: data.toCurrencyId,
              rate: new Decimal(data.rate),
            });
          } catch (e) {
            console.warn(`Invalid row skipped: ${JSON.stringify(data)}`, e);
          }
        }
      })
      .on("error", (error) => reject(error))
      .on("end", resolve);
  });

  // Insert with transaction
  await knex.transaction(async (trx) => {
    try {
      const chunkSize = 1000;
      for (let i = 0; i < exchangeRates.length; i += chunkSize) {
        await trx("exchange_rate")
          .insert(exchangeRates.slice(i, i + chunkSize))
          .onConflict(["date", "from_currency_id", "to_currency_id"])
          .ignore();
      }
      if (process.env.NODE_ENV === "local" || NODE_ENV === "docker.dev") {
        console.log(`Seeded ${exchangeRates.length} exchange rates`);
      }
    } catch (error) {
      console.error("Error inserting exchange rates:", error);
      throw error;
    }
  });
}
