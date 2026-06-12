import { z } from 'zod';

export const BANK_FEED_PROVIDER_STATUSES = [
  'active',
  'inactive',
  'deprecated',
] as const;

const optionalTrimmedString = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength).nullish();

const optionalUrl = (maxLength: number) =>
  z.url().trim().min(1).max(maxLength).nullish();

const bankFeedProviderCatalogEntry = z.object({
  id: z.uuid(),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/),
  displayName: z.string().trim().min(1).max(128),
  description: optionalTrimmedString(512),
  website: optionalUrl(2048),
  logoUrl: optionalUrl(2048),
  status: z.enum(BANK_FEED_PROVIDER_STATUSES),
  countryCodes: z.array(z.string().trim().toUpperCase().length(2)).min(1),
});

export type BankFeedProviderStatus =
  (typeof BANK_FEED_PROVIDER_STATUSES)[number];

export type BankFeedProviderCatalogEntry = z.infer<
  typeof bankFeedProviderCatalogEntry
>;

const catalog = [
  {
    id: 'ceb8e1dc-abb3-4db4-8689-8c400943ea95',
    key: 'mono',
    displayName: 'Mono',
    description: 'Mono API',
    website: 'https://mono.co',
    logoUrl: 'https://i.postimg.cc/bNMg2Bhh/mono.png',
    status: 'active',
    countryCodes: ['NG', 'GH', 'KE', 'ZA'],
  },
  {
    id: 'e5b2a79f-9d28-4afb-897c-b837b332d7a1',
    key: 'plaid',
    displayName: 'Plaid',
    description: 'Plaid API',
    website: 'https://plaid.com',
    logoUrl: 'https://i.postimg.cc/RFsVZfng/plaid.png',
    status: 'active',
    countryCodes: ['US', 'CA'],
  },
] satisfies BankFeedProviderCatalogEntry[];

function ensureUniqueBy<K extends keyof BankFeedProviderCatalogEntry>(
  rows: BankFeedProviderCatalogEntry[],
  key: K,
): void {
  const seen = new Set<BankFeedProviderCatalogEntry[K]>();
  for (const row of rows) {
    if (seen.has(row[key])) {
      throw new Error(
        `Duplicate bank feed provider catalog ${String(key)}: ${row[key]}`,
      );
    }
    seen.add(row[key]);
  }
}

function normalizeCatalog(
  rows: BankFeedProviderCatalogEntry[],
): BankFeedProviderCatalogEntry[] {
  return rows.map((row) => ({
    id: row.id,
    key: row.key.trim().toLowerCase(),
    displayName: row.displayName.trim(),
    description: row.description?.trim() ?? null,
    website: row.website?.trim() ?? null,
    logoUrl: row.logoUrl?.trim() ?? null,
    status: row.status,
    countryCodes: row.countryCodes.map((code) => code.trim().toUpperCase()),
  }));
}

function parseCatalog(input: unknown): BankFeedProviderCatalogEntry[] {
  const parsed = z.array(bankFeedProviderCatalogEntry).parse(input);
  const normalized = normalizeCatalog(parsed);

  ensureUniqueBy(normalized, 'id');
  ensureUniqueBy(normalized, 'key');

  return normalized;
}

export const BANK_FEED_PROVIDERS_CATALOG: readonly BankFeedProviderCatalogEntry[] =
  Object.freeze(parseCatalog(catalog));
