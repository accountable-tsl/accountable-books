import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';

type SearchableColumn = {
  name: string;
  column: string;
  table: string;
  coalesce: boolean;
  weight: number;
};

type SearchableColumnInput = Partial<SearchableColumn> & {
  column: string;
};

type SearchOptions = {
  minSimilarityThreshold?: number;
  fuzzyMinLength?: number;
  prefixMatch?: boolean;
  exactMatch?: boolean;
};

export function defineSearchableColumns<T extends string>(
  defaultTable: string | null,
  fields: SearchableColumnInput[],
): SearchableColumn[] {
  return fields.map((f) => {
    if (f.column.includes('.')) {
      throw new Error(
        `Invalid column "${f.column}". Use { column: "name", table: "p" } instead of "p.name".`,
      );
    }

    const table = f.table ?? defaultTable;
    if (!table) {
      throw new Error(`Missing table alias for field "${f.column}"`);
    }
    return {
      name: f.name ?? f.column,
      column: f.column,
      table,
      coalesce: f.coalesce ?? true,
      weight: f.weight != null && f.weight >= 0 ? f.weight : 1.0,
    };
  });
}

function buildSqlExpr({ column, table, coalesce }: SearchableColumn): string {
  const expr = `${table}.${column}`;
  return `LOWER(${coalesce ? `COALESCE(${expr}, '')` : expr})`;
}

export function createHybridSearch({
  search,
  searchableColumns,
  searchFields,
  useRank = true,
  trx,
  options = {},
}: {
  search?: string;
  searchableColumns: SearchableColumn[];
  searchFields?: string[]; // Optional subset of fields to search
  useRank?: boolean;
  trx?: Knex.Transaction;
  options?: SearchOptions;
}) {
  const {
    minSimilarityThreshold = 0.2,
    fuzzyMinLength = 3,
    prefixMatch = true,
    exactMatch = false,
  } = options;

  const rawSearch = search?.trim();
  const normalized = rawSearch?.toLowerCase();
  const isSearching = !!normalized;
  const isFuzzy = isSearching && normalized.length > fuzzyMinLength;
  const rankBySimilarity = isFuzzy && useRank;

  const knex = trx ?? knexClient;

  const fields = searchFields?.length
    ? searchableColumns.filter(
        (col) =>
          searchFields.includes(col.name) || searchFields.includes(col.column),
      )
    : searchableColumns;

  if (fields.length === 0) {
    throw new Error(
      'No searchable columns matched the provided search fields.',
    );
  }

  function applySearchFilter(qb: Knex.QueryBuilder): Knex.QueryBuilder {
    if (!normalized) return qb;

    return qb.andWhere(function () {
      for (const col of fields) {
        const expr = buildSqlExpr(col);

        if (isFuzzy) {
          this.orWhereRaw(`similarity(${expr}, ?) > ?`, [
            normalized,
            minSimilarityThreshold,
          ]);
        }

        if (prefixMatch) {
          this.orWhereRaw(`${expr} ILIKE ?`, [`${normalized}%`]);
        }

        if (exactMatch) {
          this.orWhereRaw(`${expr} = ?`, [normalized]);
        }
      }
    });
  }

  function buildRankExpression(): Knex.Raw | undefined {
    if (!normalized || !isFuzzy || !useRank) return;

    const weights = fields.map((f) => f.weight);
    const hasWeights = weights.some((w) => w !== 1.0);

    const sims = fields.map((f) => `similarity(${buildSqlExpr(f)}, ?)`);
    const bindings = new Array(fields.length).fill(normalized);

    const expr = hasWeights
      ? sims
          .map((s, i) =>
            weights[i] === 1 ? s : `(${s} * ${weights[i].toFixed(2)})`,
          )
          .join(' + ')
      : `GREATEST(${sims.join(', ')})`;

    return knex.raw(`${expr} as rank`, bindings);
  }

  function applyRankOrdering(qb: Knex.QueryBuilder): Knex.QueryBuilder {
    if (isFuzzy && useRank) {
      return qb.orderBy('rank', 'desc');
    }
    return qb;
  }

  const rankFields = rankBySimilarity ? [buildRankExpression()!] : [];
  const rankOrder: [string, 'asc' | 'desc'] | null = rankBySimilarity
    ? ['rank', 'desc']
    : null;

  return {
    applySearchFilter,
    applyRankOrdering,
    rankFields,
    rankOrder,
    normalizedSearch: normalized,
    isSearching,
    isFuzzySearch: isFuzzy,
    rankBySimilarity,
    searchTerm: normalized,
    fieldsCount: fields.length,
  };
}
