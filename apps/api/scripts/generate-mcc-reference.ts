import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface CsvRow {
  [key: string]: string;
}

interface StripeCategory {
  key: string;
  label: string;
}

interface MccRecord {
  mcc: string;
  title: string;
  description: string;
  category_hints: string[];
  examples: string[];
  similar_merchants: string[];
  stripe_categories: StripeCategory[];
  networks: string[];
  irs_reportable?: boolean;
  usda_description?: string;
  irs_description?: string;
}

interface MccReferenceFile {
  version: string;
  sources: {
    visa: {
      dataset: string;
      rows: number;
    };
    stripe: {
      dataset: string;
      rows: number;
    };
  };
  mccs: MccRecord[];
}

interface HintEntry {
  value: string;
  tokens: Set<string>;
  normalized: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../src/domains/categorization/data');

const VISA_SOURCE = 'visa_mcc_codes_description_extended.csv';
const STRIPE_SOURCE = 'stripe_issuing_merchant_categories.csv';
const OUTPUT_FILE = 'mcc-reference.json';

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  const pushValue = () => {
    currentRow.push(currentValue);
    currentValue = '';
  };

  const pushRow = () => {
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }
    currentRow = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentValue += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentValue += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushValue();
    } else if (char === '\r') {
      // ignore carriage returns
    } else if (char === '\n') {
      pushValue();
      pushRow();
    } else {
      currentValue += char;
    }
  }

  // Push the final value/row
  pushValue();
  pushRow();

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  const dataRows = rows
    .slice(1)
    .filter((row) => row.some((value) => value.trim().length > 0));

  return dataRows.map((row) => {
    const record: CsvRow = {};
    headers.forEach((header, index) => {
      record[header] = (row[index] ?? '').trim();
    });
    return record;
  });
}

function splitList(value?: string): string[] {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((entry) =>
          entry
            .replace(/\s+/g, ' ')
            .replace(/\uFFFD/g, ' - ')
            .replace(/\s+-\s+/g, ' - ')
            .replace(/\s{2,}/g, ' ')
            .trim(),
        )
        .filter(Boolean),
    ),
  );
}

function normaliseHint(value?: string): string | null {
  if (!value) {
    return null;
  }

  let cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return null;
  }

  cleaned = cleaned
    .replace(/\(.*?not elsewhere classified.*?\)/gi, '')
    .replace(/\bnot elsewhere classified\b/gi, '')
    .replace(/\bnec\b/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned) {
    return null;
  }

  cleaned = cleaned.replace(/^(?:and|or|&)\s+/i, '').trim();
  if (!cleaned) {
    return null;
  }

  // Keep short descriptors, avoid trailing punctuation.
  cleaned = cleaned.replace(/\.$/, '').replace(/\s*[,;:]\s*$/, '');
  return cleaned || null;
}

function stripMccPrefix(value: string): string {
  return value.replace(/^\d{4}\s*-\s*/, '').trim();
}

function tokenizeHint(value: string): Set<string> {
  const rawTokens = value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const tokens = new Set<string>();

  for (const token of rawTokens) {
    if (token.length < 2) {
      continue;
    }

    tokens.add(token);

    if (token.endsWith('ing') && token.length > 6) {
      const base = token.slice(0, -3);
      if (base.endsWith('er') || base.endsWith('or')) {
        tokens.add(base);
      }
    }

    if (token.endsWith('ers') && token.length > 4) {
      tokens.add(token.slice(0, -1));
    } else if (token.endsWith('es') && token.length > 5) {
      tokens.add(token.slice(0, -2));
    }

    if (token.endsWith('s') && token.length > 4) {
      tokens.add(token.slice(0, -1));
    }
  }

  return tokens;
}

function isSubset(subset: Set<string>, superset: Set<string>): boolean {
  for (const item of subset) {
    if (!superset.has(item)) {
      return false;
    }
  }
  return true;
}

function normalizeTokenKey(tokens: Set<string>): string {
  return Array.from(tokens).sort().join('|');
}

function loadCsv(relativePath: string): CsvRow[] {
  const filePath = path.join(dataDir, relativePath);
  const raw = readFileSync(filePath, 'utf8');
  return parseCsv(raw);
}

async function main(): Promise<void> {
  const visaRows = loadCsv(VISA_SOURCE);
  const stripeRows = loadCsv(STRIPE_SOURCE);

  const stripeByMcc = new Map<string, StripeCategory[]>();
  for (const stripeRow of stripeRows) {
    const mcc = (stripeRow.MCC ?? '').padStart(4, '0');
    const category = normaliseHint(stripeRow.Category);
    const key = stripeRow.Key?.trim();

    if (!mcc || !category || !key) {
      continue;
    }

    const existing = stripeByMcc.get(mcc) ?? [];
    existing.push({ key, label: category });
    stripeByMcc.set(mcc, existing);
  }

  const records: MccRecord[] = visaRows.map((row) => {
    const mcc = (row.MCC ?? '').padStart(4, '0');
    const title = normaliseHint(row['MCC Title']) ?? `MCC ${mcc}`;
    const rawDescription =
      normaliseHint(row['Combined Description']) ??
      normaliseHint(row['Edited Description']) ??
      normaliseHint(row['MCC Description']) ??
      '';
    const description = rawDescription.replace(/\s+/g, ' ').trim();

    const examples = splitList(row['Included in this MCC']);
    const similarMerchants = splitList(row['Similar Merchants']);
    const stripeCategories = stripeByMcc.get(mcc) ?? [];

    const hints: HintEntry[] = [];
    const addHint = (hint?: string | null) => {
      const cleaned = normaliseHint(hint ?? '');
      if (!cleaned) {
        return;
      }

      const tokens = tokenizeHint(cleaned);
      if (tokens.size === 0) {
        return;
      }

      const normalized = normalizeTokenKey(tokens);

      for (let i = 0; i < hints.length; i += 1) {
        const existing = hints[i];

        if (existing.normalized === normalized) {
          return;
        }

        if (isSubset(tokens, existing.tokens)) {
          return;
        }

        if (isSubset(existing.tokens, tokens)) {
          hints.splice(i, 1);
          i -= 1;
        }
      }

      hints.push({ value: cleaned, tokens, normalized });
    };

    addHint(title);
    addHint(description);
    description.split(/[,;/]/).forEach((entry) => addHint(entry));
    stripeCategories.forEach((entry) => addHint(entry.label));
    addHint(row['USDA Description']);
    addHint(row['IRS Description']);
    examples.forEach((example) => addHint(stripMccPrefix(example)));
    similarMerchants.forEach((merchant) => addHint(stripMccPrefix(merchant)));

    const irsReportable = (row['IRS Reportable'] ?? '').toLowerCase() === 'yes';

    const record: MccRecord = {
      mcc,
      title,
      description,
      category_hints: hints.map((entry) => entry.value),
      examples,
      similar_merchants: similarMerchants,
      stripe_categories: stripeCategories,
      networks: ['visa'],
    };

    if (irsReportable) {
      record.irs_reportable = true;
    }
    const usdaDescription = normaliseHint(row['USDA Description']);
    if (usdaDescription) {
      record.usda_description = usdaDescription;
    }
    const irsDescription = normaliseHint(row['IRS Description']);
    if (irsDescription) {
      record.irs_description = irsDescription;
    }

    return record;
  });

  const referenceFile: MccReferenceFile = {
    version: new Date().toISOString().slice(0, 10),
    sources: {
      visa: {
        dataset: VISA_SOURCE,
        rows: visaRows.length,
      },
      stripe: {
        dataset: STRIPE_SOURCE,
        rows: stripeRows.length,
      },
    },
    mccs: records,
  };

  const outputPath = path.join(dataDir, OUTPUT_FILE);
  writeFileSync(
    outputPath,
    `${JSON.stringify(referenceFile, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `Generated ${records.length} MCC records at ${path.relative(
      process.cwd(),
      outputPath,
    )}`,
  );
}

void main();
