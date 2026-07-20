import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';
import { z } from 'zod';

import { ACCOUNT_TYPES_CATALOG } from '../accounting/account-types.js';

import type { AccountTypeKey } from '../accounting/account-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const COA_TEMPLATES_CATALOG_FILE = path.join(
  __dirname,
  'coa-templates-v0.csv',
);

const TEMPLATE_NAME_REGEX =
  /^(ind|biz|acc):[a-z][a-z0-9_]*:(basic|adv|pro):(code|nocode|none):v[1-9]\d*$/;

const accountTypeKeys = new Set<string>(
  ACCOUNT_TYPES_CATALOG.map((row) => row.key),
);

const rawCsvRowSchema = z.object({
  template_name: z.string(),
  code: z.string().optional().default(''),
  name: z.string(),
  description: z.string().optional().default(''),
  account_type_key: z.string(),
  locked: z.string().optional().default(''),
});

export type CoaTemplateCatalogCsvRow = Record<string, string>;

export type CoaTemplateCatalogEntry = {
  template_name: string;
  code: string | null;
  name: string;
  description: string | null;
  account_type_key: AccountTypeKey;
  is_active: boolean;
  locked: boolean;
};

export type LoadCoaTemplateCatalogResult = {
  filePath: string;
  rowsRead: number;
  rows: CoaTemplateCatalogEntry[];
  templates: string[];
  accountTypeKeysUsed: AccountTypeKey[];
};

export class CoaTemplateCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoaTemplateCatalogError';
  }
}

function normalizeNullableText(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseLocked(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  throw new CoaTemplateCatalogError(
    `Invalid locked value "${value}". Expected blank, true, or false.`,
  );
}

function parseCsvRow(
  row: CoaTemplateCatalogCsvRow,
  rowNumber: number,
): CoaTemplateCatalogEntry {
  const parsed = rawCsvRowSchema.safeParse(row);
  if (!parsed.success) {
    throw new CoaTemplateCatalogError(
      `Row ${rowNumber} has invalid columns: ${parsed.error.message}`,
    );
  }

  const templateName = parsed.data.template_name.trim().toLowerCase();
  if (!TEMPLATE_NAME_REGEX.test(templateName)) {
    throw new CoaTemplateCatalogError(
      `Row ${rowNumber} has invalid template_name "${parsed.data.template_name}".`,
    );
  }

  const name = parsed.data.name.trim();
  if (name.length < 2 || name.length > 256) {
    throw new CoaTemplateCatalogError(
      `Row ${rowNumber} has invalid name "${parsed.data.name}".`,
    );
  }

  const code = normalizeNullableText(parsed.data.code);
  if (code && code.length > 256) {
    throw new CoaTemplateCatalogError(
      `Row ${rowNumber} has code longer than 256 characters.`,
    );
  }

  const description = normalizeNullableText(parsed.data.description);
  if (description && (description.length < 2 || description.length > 512)) {
    throw new CoaTemplateCatalogError(
      `Row ${rowNumber} has invalid description for "${name}".`,
    );
  }

  const accountTypeKey = parsed.data.account_type_key.trim();
  if (!accountTypeKeys.has(accountTypeKey)) {
    throw new CoaTemplateCatalogError(
      `Row ${rowNumber} references unknown account_type_key "${accountTypeKey}".`,
    );
  }

  return {
    template_name: templateName,
    code,
    name,
    description,
    account_type_key: accountTypeKey as AccountTypeKey,
    is_active: true,
    locked: parseLocked(parsed.data.locked),
  };
}

export function buildCoaTemplateNaturalKey(
  row: Pick<CoaTemplateCatalogEntry, 'template_name' | 'name' | 'code'>,
): string {
  const code = row.code?.trim();
  if (code) {
    return [row.template_name, code].join('|');
  }

  return [row.template_name, row.name.trim().toLowerCase()].join('|');
}

export function normalizeCoaTemplateCatalogRows(
  rows: CoaTemplateCatalogCsvRow[],
): CoaTemplateCatalogEntry[] {
  const normalizedRows = rows.map((row, index) => parseCsvRow(row, index + 2));
  const naturalKeys = new Map<string, CoaTemplateCatalogEntry[]>();

  for (const row of normalizedRows) {
    const naturalKey = buildCoaTemplateNaturalKey(row);
    naturalKeys.set(naturalKey, [...(naturalKeys.get(naturalKey) ?? []), row]);
  }

  const duplicates = [...naturalKeys.entries()].filter(
    ([, matches]) => matches.length > 1,
  );

  if (duplicates.length > 0) {
    throw new CoaTemplateCatalogError(
      `COA template catalog contains duplicate rows: ${duplicates
        .map(([naturalKey]) => naturalKey)
        .join(', ')}`,
    );
  }

  return normalizedRows;
}

export async function loadCoaTemplateCatalog(
  filePath = COA_TEMPLATES_CATALOG_FILE,
): Promise<LoadCoaTemplateCatalogResult> {
  const rawRows: CoaTemplateCatalogCsvRow[] = [];
  const stream = fs.createReadStream(filePath).pipe(csv());

  for await (const raw of stream) {
    rawRows.push(raw as CoaTemplateCatalogCsvRow);
  }

  const rows = normalizeCoaTemplateCatalogRows(rawRows);
  const templates = [...new Set(rows.map((row) => row.template_name))].sort();
  const accountTypeKeysUsed = [
    ...new Set(rows.map((row) => row.account_type_key)),
  ].sort();

  return {
    filePath,
    rowsRead: rawRows.length,
    rows,
    templates,
    accountTypeKeysUsed,
  };
}
