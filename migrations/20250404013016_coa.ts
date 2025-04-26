import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";
import { loadCoaTemplateForCompany } from "../src/domains/chartOfAccounts/coaTemplate.model";
import { createPlatformCompany } from "./20250403194332_companies";

const tableName = "coa";

const addCoaToPlatformCompany = async (knex: Knex) => {
  const template_name = "acc:prof:basic:code:v1";
  const [templateExists] = await knex("coa_templates").where({
    template_name,
  });

  if (!templateExists) {
    throw new Error("COA template not found");
  }

  const platformCompany = await createPlatformCompany(knex);

  const existingCoa = await knex("coa")
    .where({ company_id: platformCompany.id })
    .first();

  if (existingCoa) {
    console.log("Platform COA already exists. Skipping.");
    return;
  }

  const result = await loadCoaTemplateForCompany(knex, {
    companyId: platformCompany.id,
    created_by_id: platformCompany.created_by_id,
    template_name,
  });

  if (!result.success) {
    throw new Error(result.message);
  }

  console.log("Platform COA template loaded:", result.message);
  return result;
};
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("code", 256).nullable();
    table.string("name", 256).notNullable();
    table.string("description", 512).nullable();
    table.boolean("is_active").defaultTo(true);
    table.boolean("locked").defaultTo(false);
    table.specificType("source", "coa_source").nullable();

    table
      .uuid("account_type_id")
      .notNullable()
      .references("id")
      .inTable("account_types")
      .onDelete("RESTRICT");

    table
      .uuid("currency_id")
      .notNullable()
      .references("id")
      .inTable("currencies")
      .onDelete("RESTRICT");

    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("companies")
      .onDelete("RESTRICT");

    table
      .uuid("created_by_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("RESTRICT");

    addStandardColumns(table);

    table.index(["company_id", "is_deleted"], "coa_company_deleted_idx");
    table.index(["company_id", "is_active"], "coa_company_active_idx");
    table.index(["account_type_id"], "coa_account_type_idx");

    table.unique(["name", "code", "company_id"], {
      indexName: "coa_name_code_company_unique",
    });
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await addCoaToPlatformCompany(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
