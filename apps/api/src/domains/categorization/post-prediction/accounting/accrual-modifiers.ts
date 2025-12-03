import type { AccountTypeKeys } from '@accountable-books/contracts/schema';

type AccrualPolicy = {
  source_key: AccountTypeKeys;
  bs_account_key: AccountTypeKeys;
  min_amount: number;
};
const ACCRUAL_POLICIES = [];
