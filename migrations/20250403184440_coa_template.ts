import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
  preventUpdateOrDelete,
} from "../src/utils/db";
import path from "path";
import fs from "fs";
import csv from "csv-parser";
import { fileURLToPath } from "url";
import { addNewCoaTemplates } from "../src/domains/chart-of-accounts/coaTemplate.model";
import { NewCoaTemplateInput } from "../src/domains/chart-of-accounts/coaTemplate.type";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedCoaTemplates = async function seed(knex: Knex): Promise<void> {
  const coaFilePath = path.join(__dirname, "data/seed_coa_templates_v1.csv");
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
              is_active: true,
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
  const result = await addNewCoaTemplates(knex, seedCoaData);
  if (!result.success) {
    console.error("Error seeding coa templates:", result.error);
    throw new Error(result.message);
  }
};

const tableName = "coa_template";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("template_name", 256).notNullable();
    table.string("name", 256).notNullable();
    table.string("code", 256).nullable();
    table.string("description", 512).nullable();
    table.boolean("is_active").defaultTo(true);

    table
      .uuid("account_type_id")
      .notNullable()
      .references("id")
      .inTable("account_type")
      .onDelete("RESTRICT");

    addStandardColumns(table);

    table.unique(["template_name", "name"]);
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);
  await seedCoaTemplates(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
