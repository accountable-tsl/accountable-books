import type { NewCoa } from './coa.types.js';

type MustHaveAccountTypeKey =
  | 'ca_trade_receivable'
  | 'cl_trade_payable'
  | 'eq_contributed_capital';

export type MustHaveAccount = Omit<
  NewCoa,
  'company_id' | 'created_by_id' | 'currency_id' | 'account_type_id'
> & {
  account_type_key: MustHaveAccountTypeKey;
};

export const MUST_HAVE_ACCOUNTS: readonly MustHaveAccount[] = [
  {
    name: 'Trade Receivables',
    description: 'Amount due from customers',
    account_type_key: 'ca_trade_receivable',
    is_active: true,
    locked: true,
  },
  {
    name: 'Trade Payables',
    description: 'Amounts owed to suppliers',
    account_type_key: 'cl_trade_payable',
    is_active: true,
    locked: true,
  },
  {
    name: 'Owner Equity',
    description: 'Initial investment or funding',
    account_type_key: 'eq_contributed_capital',
    is_active: true,
    locked: true,
  },
] as const;
