import type { Knex } from "knex";
import path from "path";
import fs from "fs";
import csv from "csv-parser";
import { fileURLToPath } from "url";
import { NewCoaTemplateInput } from "../types/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function seed(knex: Knex): Promise<void> {
  const coaFilePath = path.join(__dirname, "data/seed_coa_template.csv");
  const seedCoaData: NewCoaTemplateInput[] = [];

  // Read and parse CSV
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(coaFilePath)
      .pipe(csv())
      .on("data", (data: Record<string, string>) => {
        if (data.template_name && data.name && data.account_type_id) {
          try {
            seedCoaData.push({
              template_name: data.template_name.toLowerCase().trim(),
              name: data.name.trim(),
              code: data.code?.trim() || null,
              description: data.description?.trim() || null,
              account_type_id: data.account_type_id,
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
      await trx("coa_template").insert(seedCoaData).onConflict().ignore();

      if (process.env.NODE_ENV === "local" || NODE_ENV === "docker.dev") {
        console.log(`Attempted to insert ${seedCoaData.length} COA lines`);
      }
    } catch (error) {
      console.error("Error inserting exchange rates:", error);
      throw error;
    }
  });
}
