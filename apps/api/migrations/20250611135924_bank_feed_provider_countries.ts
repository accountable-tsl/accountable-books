import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db';
import { adminUser } from './20250403184441_users';
import {
  MONO_COUNTRIES,
  OKRA_COUNTRIES,
  PLAID_COUNTRIES,
  SEED_BANK_FEED_PROVIDERS,
  STRIPE_COUNTRIES,
} from './data/feed_providers';
import { countryMap } from './20250404021752_banks';

function mapProviderToCountry(
  providerKey: string,
  countryCodes: string[],
  adminUserId: string,
): {
  bank_feed_provider_id: string;
  country_id: string;
  created_by_id: string;
  updated_by_id: string;
}[] {
  const provider = FEED_PROVIDERS_BY_KEY.get(providerKey);
  if (!provider) throw new Error(`Provider ${providerKey} not found`);

  return countryCodes.map((c) => {
    const country = countryMap.get(c);
    if (!country) throw new Error(`Country ${c} not found`);
    return {
      bank_feed_provider_id: provider.id,
      country_id: country.id,
      created_by_id: adminUserId,
      updated_by_id: adminUserId,
    };
  });
}

export const FEED_PROVIDERS_BY_KEY = new Map<string, any & { id: string }>();

const getProvidersData = (adminUserId: string) =>
  SEED_BANK_FEED_PROVIDERS.map((p) => {
    FEED_PROVIDERS_BY_KEY.set(p.key, p);
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      website: p.website,
      logo_url: p.logoUrl,
      status: p.status,
      priority: p.priority,
      created_by_id: adminUserId,
      updated_by_id: adminUserId,
    };
  });

const addBankFeedProviders = async (knex: Knex, data: ReturnType<typeof getProvidersData>) => {
  await knex('bank_feed_providers').insert(data).onConflict().ignore();
};

const seedBankFeedProviders = async function seed(knex: Knex): Promise<void> {
  const adminUserId = adminUser.id;
  if (!adminUserId) throw new Error('adminUserId is required');

  await addBankFeedProviders(knex, getProvidersData(adminUserId));

  const providerCountryMappings = [
    ...mapProviderToCountry('mono', MONO_COUNTRIES, adminUserId),
    ...mapProviderToCountry('okra', OKRA_COUNTRIES, adminUserId),
    ...mapProviderToCountry('plaid', PLAID_COUNTRIES, adminUserId),
    ...mapProviderToCountry('stripe', STRIPE_COUNTRIES, adminUserId),
  ];

  const x = await knex('bank_feed_provider_countries')
    .insert(providerCountryMappings)
    .returning(['bank_feed_provider_id', 'country_id']);
  console.log(`Created bank feed provider-country mappings: ${x.length}`);
};

const tableName = 'bank_feed_provider_countries';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid('bank_feed_provider_id')
      .notNullable()
      .references('id')
      .inTable('bank_feed_providers')
      .onDelete('CASCADE');
    table
      .uuid('country_id')
      .notNullable()
      .references('id')
      .inTable('countries')
      .onDelete('CASCADE');

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table.uuid('updated_by_id').nullable().references('id').inTable('users').onDelete('SET NULL');

    addStandardColumns(knex, table);

    table.primary(['bank_feed_provider_id', 'country_id']);
    table.index(['country_id'], 'idx_bank_feed_provider_countries_country_id');
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await seedBankFeedProviders(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
