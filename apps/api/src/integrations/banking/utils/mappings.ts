import type { AccountSubtype, AccountType } from 'plaid';
import type { BankAccountType } from 'src/domains/banking/bankAccounts/bankAccounts.types.js';

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
