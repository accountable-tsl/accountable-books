import { z } from 'zod';

import banksJson from './banks.json' with { type: 'json' };

export const BANK_LOCAL_CODE_TYPES = [
  'sort_code',
  'routing',
  'bank_code',
  'nip_code',
  'ifsc',
  'blz',
  'zengin_code',
  'cnaps',
] as const;

const optionalTrimmedString = (maxLength?: number) => {
  let value = z.string().trim().min(1);
  if (maxLength !== undefined) value = value.max(maxLength);
  return value.nullish();
};

const bankCatalogEntry = z.object({
  id: z.uuid(),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .max(128)
    .regex(/^[a-z]{2}_[a-z0-9_]+$/),
  display_name: z.string().trim().min(1).max(256),
  official_name: optionalTrimmedString(256),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .length(2)
    .regex(/^[A-Z]{2}$/),
  swift_code: z
    .string()
    .trim()
    .toUpperCase()
    .max(11)
    .regex(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/)
    .nullish(),
  local_code: optionalTrimmedString(64),
  local_code_type: z.enum(BANK_LOCAL_CODE_TYPES).nullish(),
  alternate_identifier: optionalTrimmedString(128),
  website: optionalTrimmedString(),
  logo_url: optionalTrimmedString(),
});

type BankCatalogJsonEntry = z.infer<typeof bankCatalogEntry>;

export type BankLocalCodeType = (typeof BANK_LOCAL_CODE_TYPES)[number];

export type BankCatalogEntry = {
  id: string;
  key: string;
  displayName: string;
  officialName: string | null;
  country: string;
  swiftCode: string | null;
  localCode: string | null;
  localCodeType: BankLocalCodeType | null;
  alternateIdentifier: string | null;
  website: string | null;
  logoUrl: string | null;
};

function ensureUniqueBy<K extends keyof BankCatalogEntry>(
  rows: BankCatalogEntry[],
  key: K,
): void {
  const seen = new Set<BankCatalogEntry[K]>();
  for (const row of rows) {
    if (seen.has(row[key])) {
      throw new Error(`Duplicate bank catalog ${String(key)}: ${row[key]}`);
    }
    seen.add(row[key]);
  }
}

function normalizeCatalog(rows: BankCatalogJsonEntry[]): BankCatalogEntry[] {
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    displayName: row.display_name,
    officialName: row.official_name ?? null,
    country: row.country,
    swiftCode: row.swift_code ?? null,
    localCode: row.local_code ?? null,
    localCodeType: row.local_code_type ?? null,
    alternateIdentifier: row.alternate_identifier ?? null,
    website: row.website ?? null,
    logoUrl: row.logo_url ?? null,
  }));
}

function validateCatalog(rows: BankCatalogEntry[]): void {
  ensureUniqueBy(rows, 'id');
  ensureUniqueBy(rows, 'key');

  for (const row of rows) {
    const countryPrefix = `${row.country.toLowerCase()}_`;
    if (!row.key.startsWith(countryPrefix)) {
      throw new Error(
        `Bank catalog key ${row.key} does not match country ${row.country}.`,
      );
    }

    if (
      (row.localCode === null && row.localCodeType !== null) ||
      (row.localCode !== null && row.localCodeType === null)
    ) {
      throw new Error(
        `Bank catalog row ${row.key} must provide localCode and localCodeType together.`,
      );
    }
  }
}

function parseBankCatalog(input: unknown): BankCatalogEntry[] {
  const parsed = z.array(bankCatalogEntry).parse(input);
  const normalized = normalizeCatalog(parsed);
  validateCatalog(normalized);
  return normalized;
}

export const BANKS_CATALOG: readonly BankCatalogEntry[] = Object.freeze(
  parseBankCatalog(banksJson),
);
