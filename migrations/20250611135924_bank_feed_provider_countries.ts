import type { Knex } from "knex";
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from "../src/utils/db";
import { adminUser } from "./20250403184441_users";
import {
  MONO_COUNTRIES,
  OKRA_COUNTRIES,
  PLAID_COUNTRIES,
  SEED_BANK_FEED_PROVIDERS,
  STRIPE_COUNTRIES,
} from "./data/feed_providers";
import {
  addBankFeedProvider,
  addBankFeedProviderCountries,
  buildProviderCountryMappings,
} from "../src/domains/bankFeedProviders/bankFeedProviders.model";
import { BpcInputCamel } from "../src/domains/bankFeedProviders/bankFeedProviders.types";

const providerCountryMappings: BpcInputCamel[] = [
  ...buildProviderCountryMappings("mono", MONO_COUNTRIES),
  ...buildProviderCountryMappings("okra", OKRA_COUNTRIES),
  ...buildProviderCountryMappings("plaid", PLAID_COUNTRIES),
  ...buildProviderCountryMappings("stripe", STRIPE_COUNTRIES),
];


const seedBankFeedProviders = async function seed(knex: Knex): Promise<void> {
  const adminUserId = adminUser.id;
  if (!adminUserId) throw new Error("adminUserId is required");

  const providers = await addBankFeedProvider({
    userId: adminUserId,
    input: SEED_BANK_FEED_PROVIDERS,
    knex,
  });

  if (!providers.success || !providers.data) {
    console.error("Error creating bank feed providers:", providers.error);
    throw new Error(providers.message);
  }

  console.log(
    `Successfully created ${providers.data.length} bank feed providers`
  );

  const mappingsResult = await addBankFeedProviderCountries({
    input: providerCountryMappings,
    userId: adminUserId,
    knex,
  });
  if (!mappingsResult.success) throw new Error(mappingsResult.message);
  console.log(`Created bank feed provider-country mappings: ${mappingsResult.data?.length ?? 0}`);
};

const tableName = "bank_feed_provider_countries";
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid("bank_feed_provider_id")
      .notNullable()
      .references("id")
      .inTable("bank_feed_providers")
      .onDelete("CASCADE");
    table
      .uuid("country_id")
      .notNullable()
      .references("id")
      .inTable("countries")
      .onDelete("CASCADE");

    table
      .uuid("created_by_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("RESTRICT");

    table
      .uuid("updated_by_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    addStandardColumns(table);

    table.primary(["bank_feed_provider_id", "country_id"]);
    table.index(["country_id"], "idx_bank_feed_provider_countries_country_id");
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await seedBankFeedProviders(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
