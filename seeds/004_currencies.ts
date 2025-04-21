import type { Knex } from "knex";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function seed(knex: Knex): Promise<void> {
  const filePath = path.join(__dirname, "data/currencies.json");

  try {
    const rawData = await fs.readFile(filePath, "utf-8");
    const currencies: Array<{
      id: string;
      name: string;
      code: string;
      symbol: string;
    }> = JSON.parse(rawData);

    await knex.transaction(async (trx) => {
      for (const currency of currencies) {
        await trx("currency")
          .insert({
            id: currency.id,
            name: currency.name.trim(),
            code: currency.code.trim().toUpperCase(),
            symbol: currency.symbol,
          })
          .onConflict("code")
          .ignore();
      }
    });

    if (process.env.NODE_ENV === "local" || NODE_ENV === "docker.dev") {
      console.log(`Seeded ${currencies.length} currencies`);
    }
  } catch (error) {
    console.error("Error seeding currencies:", error);
    throw error;
  }
}
