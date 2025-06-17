import {
  calculateStringSimilarity,
  getLastNDigits,
} from "../../shared/utils/string.utils";
import {
  BankAccountMatch,
  MonoAccountDetails,
} from "./bankAccountConnections.types";

/**
 * Calculate match score between existing bank account and provider (mono) account
 * Get human-readable reasons why accounts matched
 * Returns score between 0 and 1 (1 = perfect match) & reasons
 */
export function computeMatchScoreAndReasons({
  bankAccount,
  providerAccount,
}: {
  bankAccount: BankAccountMatch;
  providerAccount: MonoAccountDetails & {
    resolvedBankId?: string;
    resolvedCurrencyId?: string;
  };
}): { matchScore: number; matchReasons: string[] } {
  let score = 0;
  let totalWeight = 0;
  const reasons: string[] = [];

  const WEIGHTS = {
    accountNumber: 0.4, //40%
    bankId: 0.2, // 20%
    accountName: 0.2, // 20%
    bankName: 0.125, // 12.5%
    currencyId: 0.05, // 5%
    currency: 0.025, // 2.5%
  };

  // Account Number Match (Weight: 40%)
  totalWeight += WEIGHTS.accountNumber;
  if (bankAccount.accountNumber && providerAccount.account_number) {
    const cleanBankAccountNumber = bankAccount.accountNumber
      .toString()
      .replace(/\s+/g, "");

    const cleanProviderAccountNumber = providerAccount.account_number
      .toString()
      .replace(/\s+/g, "");

    if (cleanBankAccountNumber === cleanProviderAccountNumber) {
      score += WEIGHTS.accountNumber;
      reasons.push("Account number matches exactly");
    } else if (
      cleanBankAccountNumber.includes(cleanProviderAccountNumber) ||
      cleanProviderAccountNumber.includes(cleanBankAccountNumber)
    ) {
      score += WEIGHTS.accountNumber * 0.7;
      reasons.push("Account number partially matches");
    } else if (
      getLastNDigits(cleanBankAccountNumber, 4) ===
      getLastNDigits(cleanProviderAccountNumber, 4)
    ) {
      score += WEIGHTS.accountNumber * 0.5;
      reasons.push("Last 4 digits of account number match");
    }
  }

  totalWeight += WEIGHTS.bankId;
  if (bankAccount.bankId && providerAccount.resolvedBankId) {
    const similarity = calculateStringSimilarity(
      bankAccount.bankId.toLowerCase().trim(),
      providerAccount.resolvedBankId.toLowerCase().trim()
    );
    score += WEIGHTS.bankId * similarity;
    if (similarity > 0.8) {
      reasons.push("Bank ID matches");
    } else if (similarity > 0.6) {
      reasons.push("Bank ID is similar");
    }
  }

  // Bank Name Match
  totalWeight += WEIGHTS.bankName;
  if (bankAccount.bankName && providerAccount.institution?.name) {
    const similarity = calculateStringSimilarity(
      bankAccount.bankName.toLowerCase().trim(),
      providerAccount.institution.name.toLowerCase().trim()
    );
    score += WEIGHTS.bankName * similarity;
    if (similarity > 0.8) {
      reasons.push("Bank name matches");
    } else if (similarity > 0.6) {
      reasons.push("Bank name is similar");
    }
  }

  // Account Name Match
  totalWeight += WEIGHTS.accountName;
  if (bankAccount.accountName && providerAccount.name) {
    const similarity = calculateStringSimilarity(
      bankAccount.accountName.toLowerCase().trim(),
      providerAccount.name.toLowerCase().trim()
    );
    score += WEIGHTS.accountName * similarity;
    if (similarity > 0.7) {
      reasons.push("Account name is similar");
    }
  }

  // Currency ID Match
  totalWeight += WEIGHTS.currencyId;
  if (bankAccount.currencyId && providerAccount.resolvedCurrencyId) {
    if (bankAccount.currencyId === providerAccount.resolvedCurrencyId) {
      score += WEIGHTS.currencyId;
      reasons.push("Currency ID matches");
    }
  }

  // Currency Code Match
  totalWeight += WEIGHTS.currency;
  if (bankAccount.currencyCode && providerAccount.currency) {
    if (
      bankAccount.currencyCode.toUpperCase() ===
      providerAccount.currency.toUpperCase()
    ) {
      score += WEIGHTS.currency;
      reasons.push("Currency code matches");
    }
  }

  return {
    matchScore: totalWeight > 0 ? score / totalWeight : 0,
    matchReasons: reasons,
  };
}
