import type { AccountSubtype, AccountType } from 'plaid';
import type { BankAccountType } from '../../../domains/banking/bankAccounts/bankAccounts.types.js';

export function mapPlaidAccountType({
  type,
  subtype,
}: {
  type: AccountType;
  subtype?: AccountSubtype;
}): BankAccountType {
  switch (type) {
    case 'depository':
      switch (subtype) {
        case 'checking':
          return 'checkings_current';
        case 'prepaid':
          return 'debit_card';
        case 'hsa':
        case 'savings':
          return 'savings';
        default:
          return 'other';
      }
    case 'credit':
      return 'credit_card';
    default:
      return 'other';
  }
}

/**
 * Maps Mono account types to our BankAccountType enum
 */
export function mapMonoAccountType(monoType?: string): BankAccountType {
  if (!monoType) {
    return 'other';
  }

  const type = monoType.toLowerCase();

  // Mono account types: savings, current, domiciliary, etc.
  switch (type) {
    case 'savings':
    case 'savings account':
    case 'Digital Savings Account':
      return 'savings';
    case 'current':
    case 'checking':
      return 'checkings_current';
    case 'domiciliary':
      return 'other'; // USD/foreign currency account
    case 'credit':
    case 'credit_card':
      return 'credit_card';
    default:
      return 'other';
  }
}
