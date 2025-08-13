import type { Knex } from "knex";
import { type MonoAccountDetails } from "../baccons.types.js";
import { type BankAccountWithMeta } from "../../bankAccounts/bankAccounts.types.js";
import { calculateStringSimilarity } from "../../../shared/utils/string.utils.js";

/**
 * --------------------------------------------------------------------------------------------------------------------------
 * Normalize provider account data
 * --------------------------------------------------------------------------------------------------------------------------
 */
interface NormalizedProviderAccount {
  accountNumber: string;
  accountName?: string;
  bankId: string;
  bankName?: string;
  currencyId: string;
  currencyCode: string;
}

export function normalizeAccount(data: {
  accountNumber?: string;
  accountName?: string;
  bankId?: string;
  bankName?: string;
  currencyId?: string;
  currencyCode?: string;
}): NormalizedProviderAccount {
  return {
    accountNumber: data.accountNumber?.replace(/\s+/g, "").trim() ?? "",
    accountName: data.accountName?.toLowerCase().trim() ?? "",
    bankId: data.bankId?.toLowerCase().trim() ?? "",
    bankName: normalizeBankName(data.bankName),
    currencyId: data.currencyId?.toLowerCase().trim() ?? "",
    currencyCode: data.currencyCode?.toUpperCase().trim() ?? "",
  };
}

function normalizeBankName(name?: string): string {
  return (
    name
      ?.toLowerCase()
      .replace(/\b(plc|bank|ltd|inc|corp)\b/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim() ?? ""
  );
}

/**
 * --------------------------------------------------------------------------------------------------------------------------
 * Match rules
 * --------------------------------------------------------------------------------------------------------------------------
 */
type MatchRule = {
  field: string;
  description: string;
  weight: number;
  apply: (
    sys: NormalizedProviderAccount,
    provider: NormalizedProviderAccount
  ) => { score: number; reason?: string; matched: boolean };
};

// Match rules
export const MATCH_RULES: MatchRule[] = [
  {
    field: "accountNumber",
    description: "Account number match",
    weight: 0.4,
    apply: (sys, prov) => {
      if (!sys.accountNumber || !prov.accountNumber)
        return { score: 0, matched: false };

      if (sys.accountNumber === prov.accountNumber)
        return {
          score: 1,
          matched: true,
          reason: "Exact account number match",
        };

      // Partial matching with strict criteria
      const sysLen = sys.accountNumber.length;
      const provLen = prov.accountNumber.length;

      // Last 6+ digits match (for longer account numbers)
      if (sysLen >= 8 && provLen >= 8) {
        const sysLast6 = sys.accountNumber.slice(-6);
        const provLast6 = prov.accountNumber.slice(-6);
        if (sysLast6 === provLast6) {
          return { score: 0.8, matched: true, reason: "Last 6 digits match" };
        }
      }

      const lengthDiff = Math.abs(sysLen - provLen);
      if (lengthDiff >= 3) {
        // At least 3 character difference
        if (
          sys.accountNumber.includes(prov.accountNumber) ||
          prov.accountNumber.includes(sys.accountNumber)
        ) {
          return {
            score: 0.5,
            matched: true,
            reason: "Account number substring match",
          };
        }
      }

      if (sys.accountNumber.slice(-4) === prov.accountNumber.slice(-4))
        return { score: 0.3, matched: true, reason: "Last 4 digits match" };

      return { score: 0, matched: false };
    },
  },
  {
    field: "accountName",
    description: "Account name similarity",
    weight: 0.2,
    apply: (sys, prov) => {
      if (!sys.accountName || !prov.accountName)
        return { score: 0, matched: false };
      const sim = calculateStringSimilarity(sys.accountName, prov.accountName);
      return sim > 0.8
        ? {
            score: sim,
            matched: true,
            reason: `Account name similar (${Math.round(sim * 100)}%)`,
          }
        : { score: 0, matched: false };
    },
  },
  {
    field: "bankName",
    description: "Bank name similarity",
    weight: 0.1,
    apply: (sys, prov) => {
      if (!sys.bankName || !prov.bankName) return { score: 0, matched: false };
      const sim = calculateStringSimilarity(sys.bankName, prov.bankName);
      return sim > 0.8
        ? {
            score: sim,
            matched: true,
            reason: `Bank name similar (${Math.round(sim * 100)}%)`,
          }
        : { score: 0, matched: false };
    },
  },
  {
    field: "currencyId",
    description: "Currency ID match",
    weight: 0.25,
    apply: (sys, prov) => ({
      score: sys.currencyId === prov.currencyId ? 1 : 0,
      matched: sys.currencyId === prov.currencyId,
      reason:
        sys.currencyId === prov.currencyId ? "Currency ID match" : undefined,
    }),
  },
  {
    field: "currencyCode",
    description: "Currency code match",
    weight: 0.05,
    apply: (sys, prov) => ({
      score: sys.currencyCode === prov.currencyCode ? 1 : 0,
      matched: sys.currencyCode === prov.currencyCode,
      reason:
        sys.currencyCode === prov.currencyCode
          ? "Currency code match"
          : undefined,
    }),
  },
];

/**
 * Computes a fuzzy match score and provides human-readable reasons between a system account and a normalized provider account.
 * Utilizes a set of predefined match rules to evaluate the degree of similarity between the accounts.
 *
 * @param systemAccRaw - The raw system account details with metadata.
 * @param providerAccRaw - The raw normalized provider account details.
 * @returns An object containing the match score between 0 and 1 (where 1 is a perfect match), reasons for the match, and lists of matched and mismatched fields.
 */
export function computeMatchResult(
  systemAccRaw: BankAccountWithMeta,
  providerAccRaw: NormalizedProviderAccount
): MatchResult {
  const sys = normalizeAccount(systemAccRaw);
  const prov = normalizeAccount(providerAccRaw);

  let totalWeight = 0;
  let weightedScore = 0;

  const matchReasons: string[] = [];
  const matchedFields: string[] = [];
  const mismatchedFields: string[] = [];

  for (const rule of MATCH_RULES) {
    const { score, reason, matched } = rule.apply(sys, prov);
    totalWeight += rule.weight;
    weightedScore += rule.weight * score;
    if (matched) {
      matchedFields.push(rule.field);
      if (reason) matchReasons.push(reason);
    } else {
      mismatchedFields.push(rule.field);
    }
  }

  return {
    matchScore: totalWeight > 0 ? weightedScore / totalWeight : 0,
    matchReasons,
    matchedFields,
    mismatchedFields,
  };
}

/**
 * --------------------------------------------------------------------------------------------------------------------------
 * Classify confidence level of a match score
 * ----------------------------------------------------------------------------------------------------------------
 */
function classifyConfidence(
  score: number,
  thresholds = { strong: 0.8, weak: 0.6 }
): "strong" | "weak" | "none" {
  if (score >= thresholds.strong) return "strong";
  if (score >= thresholds.weak) return "weak";
  return "none";
}

/**
 * Represents the result of a fuzzy match operation.
 */
interface MatchResult {
  matchScore: number;
  matchReasons: string[];
  matchedFields: string[];
  mismatchedFields: string[];
}

/**
 * Main match engine to match a provider account (e.g., from Mono) to existing system accounts.
 * - Performs exact matching using account number, bank ID, and currency ID.
 * - If no exact match is found, performs fuzzy matching and returns ranked candidates for manual review.
 *
 * @param accountsInSystem - List of internal bank accounts (already enriched with meta).
 * @param accountToBeMatched - Provider account to match, with resolved bank & currency info.
 * @param trx - Optional DB transaction (not used here, for consistency with calling context).
 */
export const matchEngine = ({
  accountsInSystem,
  accountToBeMatched,
}: {
  accountsInSystem: BankAccountWithMeta[];
  accountToBeMatched: MonoAccountDetails & {
    resolvedBankId: string;
    resolvedCurrencyId: string;
    resolvedCurrencyCode: string;
  };
}): {
  exactMatch?: BankAccountWithMeta;
  fuzzyMatches: (BankAccountWithMeta &
    MatchResult & { matchStrength: string })[];
  unmatched: BankAccountWithMeta[];
} => {
  const providerNormalized = normalizeAccount({
    accountNumber: accountToBeMatched.account_number.toString(),
    accountName: accountToBeMatched.name,
    bankId: accountToBeMatched.resolvedBankId,
    bankName: accountToBeMatched.institution?.name,
    currencyId: accountToBeMatched.resolvedCurrencyId,
    currencyCode: accountToBeMatched.resolvedCurrencyCode,
  });

  const cleanProviderNumber = providerNormalized.accountNumber;

  // Exact Match First
  const exactMatch = accountsInSystem.find((acc) => {
    return (
      acc.accountNumber?.replace(/\s+/g, "") === cleanProviderNumber &&
      acc.bankId === providerNormalized.bankId &&
      acc.currencyId === providerNormalized.currencyId
    );
  });

  if (exactMatch) {
    return {
      exactMatch,
      fuzzyMatches: [],
      unmatched: accountsInSystem.filter((acc) => acc.id !== exactMatch.id),
    };
  }

  const candidates = accountsInSystem.filter(
    (acc) =>
      acc.bankId === providerNormalized.bankId &&
      acc.currencyId === providerNormalized.currencyId
  );

  const fuzzyMatches = candidates
    .map((acc) => {
      const result = computeMatchResult(acc, providerNormalized);
      return {
        ...acc,
        ...result,
        matchStrength: classifyConfidence(result.matchScore),
      };
    })
    .filter((m) => m.matchScore >= 0.6)
    .sort((a, b) => b.matchScore - a.matchScore);

  const matchedIds = new Set(fuzzyMatches.map((m) => m.id));
  const unmatched = candidates.filter((acc) => !matchedIds.has(acc.id));

  return { fuzzyMatches, unmatched };
};
