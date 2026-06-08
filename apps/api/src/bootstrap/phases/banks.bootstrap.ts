import type { Knex } from 'knex';

import { BANKS_CATALOG } from '../catalogs/banks/banks.js';

import type { BankCatalogEntry } from '../catalogs/banks/banks.js';
import type { BootstrappedCountry } from './countries.bootstrap.js';

const banksTable = 'app.banks';
const MUTABLE_BANK_COLUMNS = [
  'display_name',
  'official_name',
  'swift_code',
  'local_code',
  'local_code_type',
  'alternate_identifier',
  'website',
  'logo_url',
  'country_id',
  'updated_by_id',
  'is_deleted',
  'deleted_at',
] as const;
const BANK_DRIFT_SQL = MUTABLE_BANK_COLUMNS.map(
  () => '?? IS DISTINCT FROM ??.??',
).join(' OR ');
const BANK_DRIFT_BINDINGS = MUTABLE_BANK_COLUMNS.flatMap((column) => [
  column,
  'excluded',
  column,
]);

type CanonicalBankSeed = {
  id: string;
  key: string;
  display_name: string;
  official_name: string | null;
  swift_code: string | null;
  local_code: string | null;
  local_code_type: string | null;
  alternate_identifier: string | null;
  website: string | null;
  logo_url: string | null;
  country_id: string;
  created_by_id: string;
  updated_by_id: string;
  is_deleted: false;
  deleted_at: null;
};

function toCanonicalSeed(
  bank: BankCatalogEntry,
  countriesByCode: Record<string, BootstrappedCountry>,
  systemUserId: string,
): CanonicalBankSeed {
  const country = countriesByCode[bank.country];
  if (!country) {
    throw new Error(
      `Bank bootstrap could not resolve country ${bank.country} for ${bank.key}.`,
    );
  }

  return {
    id: bank.id,
    key: bank.key,
    display_name: bank.displayName,
    official_name: bank.officialName,
    swift_code: bank.swiftCode,
    local_code: bank.localCode,
    local_code_type: bank.localCodeType,
    alternate_identifier: bank.alternateIdentifier,
    website: bank.website,
    logo_url: bank.logoUrl,
    country_id: country.id,
    created_by_id: systemUserId,
    updated_by_id: systemUserId,
    is_deleted: false,
    deleted_at: null,
  };
}

export async function bootstrapBanks(
  trx: Knex.Transaction,
  options: {
    countriesByCode: Record<string, BootstrappedCountry>;
    systemUserId: string;
  },
): Promise<void> {
  const canonical = BANKS_CATALOG.map((bank) =>
    toCanonicalSeed(bank, options.countriesByCode, options.systemUserId),
  );
  const canonicalByKey = new Map(canonical.map((bank) => [bank.key, bank]));

  const existing = (await trx(banksTable)
    .select('id', 'key')
    .whereIn(
      'key',
      canonical.map((bank) => bank.key),
    )) as Pick<CanonicalBankSeed, 'id' | 'key'>[];

  const mismatchedIds = existing.filter(
    (bank) => canonicalByKey.get(bank.key)?.id !== bank.id,
  );
  if (mismatchedIds.length > 0) {
    const details = mismatchedIds
      .map((bank) => {
        const expected = canonicalByKey.get(bank.key)!;
        return `${bank.key} (expected ${expected.id}, found ${bank.id})`;
      })
      .join(', ');

    throw new Error(
      `Bank bootstrap found id mismatches in ${banksTable}: ${details}. Resolve manually before re-running bootstrap.`,
    );
  }

  await trx(banksTable)
    .insert(canonical)
    .onConflict('key')
    .merge([...MUTABLE_BANK_COLUMNS])
    .whereRaw(BANK_DRIFT_SQL, BANK_DRIFT_BINDINGS);
}
