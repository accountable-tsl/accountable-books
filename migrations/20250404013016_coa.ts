import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";

const tableName = "coa";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("code", 256).nullable();
    table.string("name", 256).notNullable();
    table.string("description", 512).nullable();
    table.boolean("is_active").defaultTo(true);

    table
      .uuid("account_type_id")
      .notNullable()
      .references("id")
      .inTable("account_type")
      .onDelete("RESTRICT");

    table
      .uuid("currency_id")
      .notNullable()
      .references("id")
      .inTable("currency")
      .onDelete("RESTRICT");

    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("company")
      .onDelete("RESTRICT");

    table
      .uuid("created_by_id")
      .notNullable()
      .references("id")
      .inTable("user")
      .onDelete("RESTRICT");

    addStandardColumns(table);

    table.index(["company_id", "is_deleted"], "coa_company_deleted_idx");
    table.index(["company_id", "is_active"], "coa_company_active_idx");
    table.index(["account_type_id"], "coa_account_type_idx");

    table.unique(["code", "company_id"], {
      indexName: "coa_code_company_unique",
    });
    table.unique(["name", "company_id"], {
      indexName: "coa_name_company_unique",
    });
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
