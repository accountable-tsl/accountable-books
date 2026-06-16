import type { AccountingBasis } from '@accountable-books/contracts/schema';

import { generateFingerprintSync } from '../../../../shared/utils/crypto.utils.js';

import type { Fingerprint } from '../../../../shared/utils/crypto.utils.js';
import type { FiscalPeriodType } from '../../fiscal-calendar/fiscal-calendar.types.js';
import type { CloseReviewSignalCode } from './close-signals.types.js';

/**
 * Amounts are decimals; normalize to a fixed scale before hashing so float
 * representation never destabilizes a fingerprint.
 */
const AMOUNT_FINGERPRINT_SCALE = 4;

function normalizeAmount(amount: number | null): string {
  return amount === null ? 'null' : amount.toFixed(AMOUNT_FINGERPRINT_SCALE);
}

/**
 * Stable identity of a signal — never material state. Identity is the company,
 * period, transaction, code, account, and (for leg-specific signals) the ledger
 * entry, which is the stable line identity. Amount is deliberately NOT here: a
 * changed amount is a changed fact (facts_hash), not a different finding.
 */
export function buildSignalFingerprint(input: {
  companyId: string;
  fiscalYear: number;
  periodNumber: number;
  periodType: FiscalPeriodType;
  ledgerTransactionId: string;
  code: CloseReviewSignalCode;
  coaId: string | null;
  ledgerEntryId: string | null;
}): Fingerprint {
  return generateFingerprintSync(
    {
      company: input.companyId,
      fiscalYear: input.fiscalYear,
      periodNumber: input.periodNumber,
      periodType: input.periodType,
      ledgerTransaction: input.ledgerTransactionId,
      code: input.code,
      coa: input.coaId ?? 'null',
      ledgerEntry: input.ledgerEntryId ?? 'null',
    },
    { sortKeys: true },
  );
}

/**
 * Material facts behind a signal. When any of these change, the hash changes
 * and a prior acknowledgement no longer matches — so it re-opens. `extra`
 * carries signal-specific material facts (e.g. confidence) that are not in the
 * standard column set.
 */
export function buildSignalFactsHash(input: {
  amount: number | null;
  coaId: string | null;
  categorizationSource: string | null;
  accountTypeKey: string | null;
  accountingBasis: AccountingBasis;
  extra?: Record<string, unknown>;
}): Fingerprint {
  return generateFingerprintSync(
    {
      amount: normalizeAmount(input.amount),
      coa: input.coaId ?? 'null',
      categorizationSource: input.categorizationSource ?? 'null',
      accountTypeKey: input.accountTypeKey ?? 'null',
      basis: input.accountingBasis,
      extra: input.extra ?? {},
    },
    { sortKeys: true },
  );
}
