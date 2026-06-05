import fs from 'fs';
import csv from 'csv-parser';
import type { Knex } from 'knex';
import { z } from 'zod';

export type FxPackDefinition = {
  id: string;
  provider: 'cbn' | 'boe';
  source: 'seed';
  filePath: string;
  description: string;
};

type CurrencyLookup = {
  id: string;
  code: string;
};

type FxCatalogCsvRow = Record<string, string>;

export type LoadFxPackResult = {
  packId: string;
  provider: string;
  filePath: string;
  rowsRead: number;
  rowsPrepared: number;
  rowsUpserted: number;
  skippedInvalid: number;
  skippedUnknownCurrency: number;
  skippedSameCurrency: number;
};

type LoadFxPackOptions = {
  pack: FxPackDefinition;
  trx: Knex.Transaction;
  currenciesByCode: Record<string, CurrencyLookup>;
  filePathOverride?: string;
  chunkSize?: number;
};

type FxExchangeRateInsertRow = {
  rate_date: string;
  base_currency_id: string;
  price_currency_id: string;
  rate: string;
  source: 'seed';
  provider: string;
  ingested_at: Date;
  updated_at: Date;
};

const csvRowSchema = z.object({
  date: z.iso.date(),
  price_currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/),
  base_currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/),
  rate: z.coerce.number().positive(),
});

const tableName = 'app.exchange_rates';

function toDbRow(
  row: FxCatalogCsvRow,
  provider: string,
  currenciesByCode: Record<string, CurrencyLookup>,
): FxExchangeRateInsertRow | 'invalid' | 'same_currency' | 'unknown_currency' {
  const parsed = csvRowSchema.safeParse({
    date: row.date ?? '',
    price_currency: row.price_currency ?? '',
    base_currency: row.base_currency ?? '',
    rate: row.rate ?? '',
  });
  if (!parsed.success) {
    return 'invalid';
  }

  const normalizedBaseCode = parsed.data.base_currency.toUpperCase();
  const normalizedPriceCode = parsed.data.price_currency.toUpperCase();

  if (normalizedBaseCode === normalizedPriceCode) {
    return 'same_currency';
  }

  const baseCurrency = currenciesByCode[normalizedBaseCode];
  const priceCurrency = currenciesByCode[normalizedPriceCode];

  if (!baseCurrency?.id || !priceCurrency?.id) {
    return 'unknown_currency';
  }

  const timestamp = new Date();
  return {
    rate_date: parsed.data.date,
    base_currency_id: baseCurrency.id,
    price_currency_id: priceCurrency.id,
    rate: parsed.data.rate.toString(),
    source: 'seed',
    provider,
    ingested_at: timestamp,
    updated_at: timestamp,
  };
}

async function upsertRows(
  trx: Knex.Transaction,
  rows: FxExchangeRateInsertRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await trx(tableName)
    .insert(rows)
    .onConflict(['rate_date', 'base_currency_id', 'price_currency_id'])
    .merge(['rate', 'provider', 'ingested_at', 'updated_at']);
}

export async function loadFxPack({
  pack,
  trx,
  currenciesByCode,
  filePathOverride,
  chunkSize = 1000,
}: LoadFxPackOptions): Promise<LoadFxPackResult> {
  const filePath = filePathOverride ?? pack.filePath;
  let rowsRead = 0;
  let rowsPrepared = 0;
  let rowsUpserted = 0;
  let skippedInvalid = 0;
  let skippedUnknownCurrency = 0;
  let skippedSameCurrency = 0;
  let chunk: FxExchangeRateInsertRow[] = [];

  const stream = fs.createReadStream(filePath).pipe(csv());
  for await (const raw of stream) {
    rowsRead += 1;
    const normalized = toDbRow(
      raw as FxCatalogCsvRow,
      pack.provider,
      currenciesByCode,
    );

    if (normalized === 'invalid') {
      skippedInvalid += 1;
      continue;
    }

    if (normalized === 'unknown_currency') {
      skippedUnknownCurrency += 1;
      continue;
    }

    if (normalized === 'same_currency') {
      skippedSameCurrency += 1;
      continue;
    }

    chunk.push(normalized);
    rowsPrepared += 1;

    if (chunk.length >= chunkSize) {
      await upsertRows(trx, chunk);
      rowsUpserted += chunk.length;
      chunk = [];
    }
  }

  if (chunk.length > 0) {
    await upsertRows(trx, chunk);
    rowsUpserted += chunk.length;
  }

  return {
    packId: pack.id,
    provider: pack.provider,
    filePath,
    rowsRead,
    rowsPrepared,
    rowsUpserted,
    skippedInvalid,
    skippedUnknownCurrency,
    skippedSameCurrency,
  };
}

