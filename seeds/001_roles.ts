import type { Knex } from "knex";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { NewRoleInput } from "../types/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function seed(knex: Knex): Promise<void> {
  const filePath = path.join(__dirname, "data/roles.json");

  try {
    // Read and parse with validation
    const rawData = await fs.readFile(filePath, "utf-8");
    const roles: Array<NewRoleInput> = JSON.parse(rawData);

    // Batch insert for better performance
    await knex.transaction(async (trx) => {
      for (const role of roles) {
        await trx("role")
          .insert({
            name: role.name.toLowerCase().trim(),
            description: role.description,
          })
          .onConflict("name")
          .ignore();
      }
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(`Seeded ${roles.length} roles`);
    }
  } catch (error) {
    console.error("Error seeding roles:", error);
    throw error;
  }
}
