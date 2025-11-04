import type { Knex } from 'knex';
import { type BankTransactionFilters } from './bankTransactions.types.js';
import { generateFingerprintSync } from '../../shared/index.js';

const bankTransactionQuerySelect = ['bt.*', 'ba.*', 'banks.*', 'currencies.'];
export function buildBankTransactionQuery({
  knex,
  companyId,
  filters = {},
}: {
  knex: Knex;
  companyId: string;
  filters?: BankTransactionFilters;
}) {
  let query = knex('bank_transactions as bt')
    .select(bankTransactionQuerySelect)
    .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
    .leftJoin('banks', 'ba.bank_id', 'banks.id')
    .leftJoin('currencies', 'ba.currencyId', 'currencies.id')
    .where('ba.companyId', companyId)
    .andWhere('bt.is_deleted', filters.isDeleted ?? false)
    .orderBy('bt.date', 'asc')
    .orderBy('bt.created_at', 'asc');

  const page = filters?.currentPage;
  const pageSize = filters?.pageSize;
  const offset = filters?.offset || (page && pageSize && (page - 1) * pageSize);
  if (offset !== undefined && pageSize !== undefined) {
    query = query.offset(offset).limit(pageSize);
  }

  if (filters.bankAccountIds) {
    query = query.whereIn('bt.bank_account_id', filters.bankAccountIds);
  }
  if (filters.startDate) {
    query = query.andWhere('bt.date', '>=', filters.startDate);
  }
  if (filters.endDate) {
    query = query.andWhere('bt.date', '<=', filters.endDate);
  }
  if (filters.transactionSide) {
    query = query.andWhere('bt.transaction_side', filters.transactionSide);
  }
  if (filters.minAmount) {
    query = query.andWhere('bt.absolute_amount', '>=', filters.minAmount);
  }
  if (filters.maxAmount) {
    query = query.andWhere('bt.absolute_amount', '<=', filters.maxAmount);
  }
  if (filters.searchQuery) {
    query = query.andWhereRaw(
      `to_tsvector('english', coalesce("bt"."reference", '') || ' ' || coalesce("bt"."description", '')) @@ plainto_tsquery(?)`,
      [filters.searchQuery.trim()],
    );
  }

  return query;
}

function isoDate(d: string | Date): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) throw new Error('Invalid date');
  return x.toISOString(); // UTC
}

function normalizeAmount(a: number | string): string {
  const n = typeof a === 'string' ? Number(a) : a;
  if (!Number.isFinite(n)) throw new Error('Invalid amount');
  return n.toFixed(10); // matches NUMERIC(32,10) scale
}

type Txn = {
  date: string | Date;
  amount: number | string;
  description?: string | null;
  reference?: string | null;
  contact?: string | null;
  payee?: string | null;
};

function canonicalTxn(t: Txn): string {
  // Fixed key order for deterministic JSON
  return JSON.stringify({
    date: isoDate(t.date),
    amount: normalizeAmount(t.amount),
    description: t.description ?? '',
    reference: t.reference ?? '',
    contact: t.contact || t.payee || '',
  });
}

export function generateBatchFingerprint(txns: Txn[]): string {
  if (txns.length === 0) return generateFingerprintSync('empty');

  // 1) per-transaction canonical strings -> hashes
  const perTxn = txns.map((t) => generateFingerprintSync(canonicalTxn(t)));

  // 2) order-independent combine: sort then hash the concatenation
  perTxn.sort(); // lexical sort of hex strings
  return generateFingerprintSync(perTxn.join(''));
}
