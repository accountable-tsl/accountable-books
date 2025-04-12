import type { Knex } from "knex";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function seed(knex: Knex): Promise<void> {
  const filePath = path.join(__dirname, "data/countries.json");

  try {
    const rawData = await fs.readFile(filePath, "utf-8");
    const countries: Array<{
      id: string;
      code: string;
      name: string;
      phone_code: string;
      flag: string | null;
      continent: string | null;
    }> = JSON.parse(rawData);

    await knex.transaction(async (trx) => {
      for (const country of countries) {
        await trx("country")
          .insert({
            id: country.id,
            code: country.code.trim().toUpperCase(),
            name: country.name.trim(),
            phone_code: country.phone_code,
            flag: country.flag || null,
            continent: country.continent || null,
          })
          .onConflict("code")
          .ignore();
      }
    });

    if (process.env.NODE_ENV === "local" || NODE_ENV === "docker.dev") {
      console.log(`Seeded ${countries.length} countries`);
    }
  } catch (error) {
    console.error("Error seeding countries:", error);
    throw error;
  }
}
