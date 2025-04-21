import { accountTypeIds } from "../../shared/constants/account.constants";
import { NewCoa } from "./coa.types";

export const DEFAULT_ACCOUNT_TYPE_IDS = {
  tradeReceivables: "d764021a-0847-4be8-a687-9c8195b47f6d",
  tradePayables: "7def2082-8695-4d32-a385-2827e46747db",
  ownersEquity: "39a0bb4a-fae3-4eab-bdac-fcf2794476a5",
};

export const mustHaveAccounts: Omit<
  NewCoa,
  "company_id" | "created_by_id" | "currency_id"
>[] = [
  {
    name: "Trade Receivables",
    description: "Amount due from customers",
    account_type_id:
      accountTypeIds.ca_trade_receivable ||
      DEFAULT_ACCOUNT_TYPE_IDS.tradeReceivables,
    is_active: true,
    locked: true,
  },
  {
    name: "Trade Payables",
    description: "Amounts owed to suppliers",
    account_type_id:
      accountTypeIds.cl_trade_payable || DEFAULT_ACCOUNT_TYPE_IDS.tradePayables,
    is_active: true,
    locked: true,
  },
  {
    name: "Owner Equity",
    description: "Initial investment or funding",
    account_type_id:
      accountTypeIds.eq_contributed_capital ||
      DEFAULT_ACCOUNT_TYPE_IDS.ownersEquity,
    is_active: true,
    locked: true,
  },
];
