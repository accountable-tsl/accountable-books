import path from 'path';
import { fileURLToPath } from 'url';
import type { Knex } from 'knex';

import { loadFxPack } from '../catalogs/fx/load-fx-pack.js';

import type {
  FxPackDefinition,
  LoadFxPackResult,
} from '../catalogs/fx/load-fx-pack.js';
import type { BootstrappedCurrency } from './currencies.bootstrap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fxSeedDataDir = path.resolve(__dirname, '../catalogs/fx/data');

const FX_SEED_PACKS = {
  cbn: {
    id: 'cbn',
    provider: 'cbn',
    source: 'seed',
    filePath: path.join(fxSeedDataDir, 'cbn-2002-may2026.csv'),
    description: 'CBN daily FX reference rates (2002 to May 2026)',
  },
  boe: {
    id: 'boe',
    provider: 'boe',
    source: 'seed',
    filePath: path.join(fxSeedDataDir, 'boe-2020-may2026.csv'),
    description: 'BoE daily FX reference rates (2020 to May 2026)',
  },
} as const satisfies Record<string, FxPackDefinition>;

const FX_SEED_PACK_IDS = Object.keys(FX_SEED_PACKS) as Array<
  keyof typeof FX_SEED_PACKS
>;
export type FxSeedPackId = (typeof FX_SEED_PACK_IDS)[number];

type BootstrapFxSeedsOptions = {
  currenciesByCode: Record<string, BootstrappedCurrency>;
  packIds: FxSeedPackId[];
  packFilePathOverrides?: Partial<Record<FxSeedPackId, string>>;
  chunkSize?: number;
};

export type BootstrapFxSeedsResult = {
  results: LoadFxPackResult[];
};

export function resolveFxSeedPackIdsFromEnv(
  envValue: string | undefined,
): FxSeedPackId[] {
  if (!envValue || envValue.trim().length === 0) return [];

  const parsed = new Set<FxSeedPackId>();
  const invalid: string[] = [];

  for (const token of envValue.split(',')) {
    const normalized = token.trim().toLowerCase();
    if (!normalized) continue;

    if (normalized === 'all') {
      for (const id of FX_SEED_PACK_IDS) parsed.add(id);
      continue;
    }

    if (FX_SEED_PACK_IDS.includes(normalized as FxSeedPackId)) {
      parsed.add(normalized as FxSeedPackId);
      continue;
    }

    invalid.push(token.trim());
  }

  if (invalid.length > 0) {
    throw new Error(
      `Invalid FX seed pack id(s): ${invalid.join(', ')}. Allowed: ${FX_SEED_PACK_IDS.join(', ')}, all.`,
    );
  }

  return [...parsed];
}

export async function bootstrapFxSeeds(
  trx: Knex.Transaction,
  options: BootstrapFxSeedsOptions,
): Promise<BootstrapFxSeedsResult> {
  const { currenciesByCode, packIds, packFilePathOverrides, chunkSize } =
    options;

  const results: LoadFxPackResult[] = [];

  for (const packId of packIds) {
    const pack = FX_SEED_PACKS[packId];
    const filePathOverride = packFilePathOverrides?.[packId];

    const result = await loadFxPack({
      pack,
      trx,
      currenciesByCode,
      filePathOverride,
      chunkSize,
    });

    results.push(result);
  }

  return { results };
}
