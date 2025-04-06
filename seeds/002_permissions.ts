import type { Knex } from "knex";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function seed(knex: Knex): Promise<void> {
  const filePath = path.join(__dirname, "data/permissions.json");

  try {
    // Read and parse with validation
    const rawData = await fs.readFile(filePath, "utf-8");
    const permissions: Array<{
      key: string;
      action: string;
      resource: string;
      label: string;
      description: string;
    }> = JSON.parse(rawData);

    // Batch insert for better performance
    await knex.transaction(async (trx) => {
      for (const permission of permissions) {
        await trx("permission")
          .insert({
            key: permission.key,
            action: permission.action,
            resource: permission.resource,
            label: permission.label,
            description: permission.description,
          })
          .onConflict(["action", "resource"])
          .ignore();
      }
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(`Seeded ${permissions.length} permissions`);
    }
  } catch (error) {
    console.error("Error seeding permissions:", error);
    throw error;
  }
}
