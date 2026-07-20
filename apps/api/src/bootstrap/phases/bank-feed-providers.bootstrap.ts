import type { Knex } from 'knex';

import { BANK_FEED_PROVIDERS_CATALOG } from '../catalogs/bank-feed-providers/bank-feed-providers.js';

import type {
  BankFeedProviderCatalogEntry,
  BankFeedProviderStatus,
} from '../catalogs/bank-feed-providers/bank-feed-providers.js';
import type { BootstrappedCountry } from './countries.bootstrap.js';

const bankFeedProvidersTable = 'app.bank_feed_providers';
const MUTABLE_BANK_FEED_PROVIDER_COLUMNS = [
  'display_name',
  'description',
  'website',
  'logo_url',
  'status',
  'updated_by_id',
] as const;

const BANK_FEED_PROVIDER_DRIFT_SQL = MUTABLE_BANK_FEED_PROVIDER_COLUMNS.map(
  () => '??.?? IS DISTINCT FROM ??.??',
).join(' OR ');

const BANK_FEED_PROVIDER_DRIFT_BINDINGS =
  MUTABLE_BANK_FEED_PROVIDER_COLUMNS.flatMap((column) => [
    bankFeedProvidersTable,
    column,
    'excluded',
    column,
  ]);

type CanonicalBankFeedProviderSeed = {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  status: BankFeedProviderStatus;
  created_by_id: string;
  updated_by_id: string;
};

function toCanonicalSeed(
  provider: BankFeedProviderCatalogEntry,
  systemUserId: string,
): CanonicalBankFeedProviderSeed {
  return {
    id: provider.id,
    key: provider.key,
    display_name: provider.displayName,
    description: provider.description ?? null,
    website: provider.website ?? null,
    logo_url: provider.logoUrl ?? null,
    status: provider.status,
    created_by_id: systemUserId,
    updated_by_id: systemUserId,
  };
}

export async function bootstrapBankFeedProviders(
  trx: Knex.Transaction,
  options: {
    systemUserId: string;
    countriesByCode?: Record<string, BootstrappedCountry>;
  },
): Promise<void> {
  const canonical = BANK_FEED_PROVIDERS_CATALOG.map((provider) =>
    toCanonicalSeed(provider, options.systemUserId),
  );
  const canonicalByKey = new Map(
    canonical.map((provider) => [provider.key, provider]),
  );

  const existing = (await trx(bankFeedProvidersTable)
    .select('id', 'key')
    .whereIn(
      'key',
      canonical.map((provider) => provider.key),
    )) as Pick<CanonicalBankFeedProviderSeed, 'id' | 'key'>[];

  const mismatchedIds = existing.filter(
    (provider) => canonicalByKey.get(provider.key)?.id !== provider.id,
  );
  if (mismatchedIds.length > 0) {
    const details = mismatchedIds
      .map((provider) => {
        const expected = canonicalByKey.get(provider.key)!;
        return `${provider.key} (expected ${expected.id}, found ${provider.id})`;
      })
      .join(', ');

    throw new Error(
      `Bank feed provider bootstrap found id mismatches in ${bankFeedProvidersTable}: ${details}. Resolve manually before re-running bootstrap.`,
    );
  }

  await trx(bankFeedProvidersTable)
    .insert(canonical)
    .onConflict('key')
    .merge([...MUTABLE_BANK_FEED_PROVIDER_COLUMNS])
    .whereRaw(BANK_FEED_PROVIDER_DRIFT_SQL, BANK_FEED_PROVIDER_DRIFT_BINDINGS);

  if (!options.countriesByCode) return;

  const countryMappings = BANK_FEED_PROVIDERS_CATALOG.flatMap((provider) =>
    provider.countryCodes.map((countryCode) => {
      const country = options.countriesByCode![countryCode];
      if (!country) {
        throw new Error(
          `Bank feed provider ${provider.key} references unknown country ${countryCode}`,
        );
      }
      return {
        bank_feed_provider_id: provider.id,
        country_id: country.id,
        active: true,
        created_by_id: options.systemUserId,
        updated_by_id: options.systemUserId,
      };
    }),
  );

  await trx('app.bank_feed_provider_countries')
    .insert(countryMappings)
    .onConflict(['bank_feed_provider_id', 'country_id'])
    .ignore();
}
