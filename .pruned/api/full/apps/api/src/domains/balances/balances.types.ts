export interface CoaBalance {
  accountName: string;
  reportingBalance: number;
  nativeBalance?: number;
}

export interface CoaBalanceOptions {
  onlyActive?: boolean;
  coaIds?: string[]; // filter for specific COA accounts
  accountTypeIdsOrKeys?: string[];
  excludeAccountTypeIdsOrKeys?: string[];
  includeSourceAmount?: boolean;
}

export interface BankBalance {
  reportingBalance: number;
  nativeBalance: number;
  transactionCount?: number;
  categorizedCount?: number;
  uncategorizedCount?: number;
  autoCategorizedCount?: number;
}

export interface GetBankAccountBalancesOptions {
  bankAccountIds?: string[];
  includeStats?: boolean;
}
