import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";
import { ENV } from "../src/config/env";
import { adminUser } from "./20250403184441_user";
import { createPlatformCompany } from "./20250403194332_company";
import { newAccFirm } from "../src/domains/accountingFirm/accountingFirm.types";
import { z } from "zod";

const tableName = "accounting_firm";

export const buildPlatformAccountingFirm = (platformCompany: any) => ({
  id: ENV.PLATFORM_FIRM_ID || "fb60dc2d-732e-4bf6-9f0c-74577354e816",
  company_id: platformCompany.id,
  legal_name: platformCompany.legal_name,
  country_id: platformCompany.country_id,
  created_by_id: platformCompany.created_by_id,

  display_name: platformCompany.legal_name, // Deliberate
  is_platform: true,
  logo_url: platformCompany.logo_url,
  website: platformCompany.website,
});
export const createPlatformFirm = async (knex: Knex) => {
  if (!adminUser.id) throw new Error("adminUserId is required");
  const platformCompany = await createPlatformCompany(knex);
  if (!platformCompany?.id || !platformCompany.legal_name) {
    throw new Error("Invalid platform company returned");
  }
  const platformFirmType = newAccFirm.extend({ is_platform: z.literal(true) });

  const platformFirm = platformFirmType.safeParse(
    buildPlatformAccountingFirm(platformCompany)
  );
  if (!platformFirm.success) {
    throw new Error(platformFirm.error.message);
  }

  const platformFirmExists = await knex(tableName)
    .where({ id: platformFirm.data.id })
    .first();

  if (platformFirmExists) {
    console.log("Platform accounting firm already exists. Skipping insert.");
    return platformFirmExists;
  }

  const [insertedPlatformFirm] = await knex(tableName)
    .insert({ ...platformFirm.data, is_platform: true } as any)
    .returning("*");
  console.log(
    `Successfully created platform accounting firm: ${insertedPlatformFirm.display_name}`
  );
  return insertedPlatformFirm;
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("company_id")
      .unique()
      .notNullable()
      .references("id")
      .inTable("company")
      .onDelete("RESTRICT"); // Company that is the accounting firm's HQ
    table.string("legal_name", 256).notNullable();
    table.string("display_name", 256).notNullable();
    table.string("slug", 50).unique().nullable();
    table.string("firm_type", 50).nullable(); //freelancer, ca / cpa, tax preparer, international
    table.string("firm_size", 50).nullable();
    table.string("website", 256).nullable();
    table.string("revenue", 50).nullable();
    table.string("logo_url", 256).nullable();
    table.boolean("is_platform").defaultTo(false);
    table.string("registration_number").nullable();
    table.string("tax_id").nullable();

    table
      .uuid("country_id")
      .notNullable()
      .references("id")
      .inTable("country")
      .onDelete("RESTRICT");

    table
      .uuid("created_by_id")
      .notNullable()
      .references("id")
      .inTable("user")
      .onDelete("RESTRICT");

    addStandardColumns(table);
  });

  const hasColumn = await knex.schema.hasColumn("company", "assigned_firm_id");
  if (!hasColumn) {
    await knex.schema.alterTable("company", (table) => {
      table
        .uuid("assigned_firm_id")
        .references("id")
        .inTable("accounting_firm")
        .onDelete("SET NULL");
    });
  }

  await createUpdateTimestampTrigger(knex, tableName);
  await createPlatformFirm(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
