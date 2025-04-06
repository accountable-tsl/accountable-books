import type { Knex } from "knex";
import { NewAccountElementInput } from "../types/db";
import { accountElementIds, financialStatementIds } from "./constants/ids";

type NewAccountElementWithId = NewAccountElementInput & { id: string };

const parentAccountElements: NewAccountElementWithId[] = [
  {
    id: accountElementIds.assets,
    label: "Assets",
    key: "assets",
    default_side: "debit",
    parent_id: null,
    financial_statement_id: financialStatementIds.bs,
    description: "All asset accounts",
  },
  {
    id: accountElementIds.liabilities,
    label: "Liabilities",
    key: "liabilities",
    default_side: "credit",
    parent_id: null,
    financial_statement_id: financialStatementIds.bs,
    description: "All liability accounts",
  },
  {
    id: accountElementIds.equity,
    label: "Equity",
    key: "equity",
    default_side: "credit",
    parent_id: null,
    financial_statement_id: financialStatementIds.bs,
    description: "Ownership interests",
  },
  {
    id: accountElementIds.income,
    label: "Income",
    key: "income",
    default_side: "credit",
    parent_id: null,
    financial_statement_id: financialStatementIds.is,
    description: "All income and revenue accounts",
  },
  {
    id: accountElementIds.expenses,
    label: "Expenses",
    key: "expenses",
    default_side: "debit",
    parent_id: null,
    financial_statement_id: financialStatementIds.is,
    description: "All expenses, cost of sales, etc",
  },
];

const childrenAccountElements: NewAccountElementWithId[] = [
  {
    id: accountElementIds.nonCurrentAsset,
    key: "non_current_asset",
    label: "Non-current Asset",
    default_side: "debit",
    parent_id: accountElementIds.assets,
    financial_statement_id: financialStatementIds.bs,
    description:
      "Long-term assets such as property, equipment, investments, and intangibles",
  },
  {
    id: accountElementIds.contraAsset,
    key: "contra_asset",
    label: "Contra Asset",
    default_side: "credit",
    parent_id: accountElementIds.assets,
    financial_statement_id: financialStatementIds.bs,
    description:
      "Accounts that offset asset balances, such as accumulated depreciation",
  },
  {
    id: accountElementIds.currentAsset,
    key: "current_asset",
    label: "Current Asset",
    default_side: "debit",
    parent_id: accountElementIds.assets,
    financial_statement_id: financialStatementIds.bs,
    description: "Short-term, liquid assets like cash, receivables, inventory",
  },
  {
    id: accountElementIds.currentLiabilities,
    key: "current_liabilities",
    label: "Current Liabilities",
    default_side: "credit",
    parent_id: accountElementIds.liabilities,
    financial_statement_id: financialStatementIds.bs,
    description:
      "Short-term liabilities like accounts payable, short-term debt",
  },
  {
    id: accountElementIds.nonCurrentLiabilities,
    key: "non_current_liabilities",
    label: "Non-current Liabilities",
    default_side: "credit",
    parent_id: accountElementIds.liabilities,
    financial_statement_id: financialStatementIds.bs,
    description: "Long-term liabilities like long-term debt, deferred taxes",
  },
  {
    id: accountElementIds.capital,
    key: "contributed_capital",
    label: "Contributed Capital",
    default_side: "credit",
    parent_id: accountElementIds.equity,
    financial_statement_id: financialStatementIds.bs,
    description:
      "Share capital, premium, APIC, other direct contributions from owners",
  },
  {
    id: accountElementIds.reserves,
    key: "reserves",
    label: "Reserves",
    default_side: "credit",
    parent_id: accountElementIds.equity,
    financial_statement_id: financialStatementIds.bs,
    description: "Retained Earnings and Other Reserves",
  },
  {
    id: accountElementIds.otherEquity,
    key: "other_equity",
    label: "Other Equity",
    default_side: "credit",
    parent_id: accountElementIds.equity,
    financial_statement_id: financialStatementIds.bs,
    description:
      "Accumulated Other Comprehensive Income and other components of equity",
  },
  {
    id: accountElementIds.revenue,
    key: "revenue",
    label: "Revenue",
    default_side: "credit",
    parent_id: accountElementIds.income,
    financial_statement_id: financialStatementIds.is,
    description:
      "Income from primary business activities, including sales and services",
  },
  {
    id: accountElementIds.otherIncome,
    key: "other_income",
    label: "Other Income",
    default_side: "credit",
    parent_id: accountElementIds.income,
    financial_statement_id: financialStatementIds.is,
    description: "Income from sources outside primary business activities",
  },
  {
    id: accountElementIds.contraRevenue,
    key: "contra_revenue",
    label: "Contra Revenue",
    default_side: "debit",
    parent_id: accountElementIds.income,
    financial_statement_id: financialStatementIds.is,
    description:
      "Reductions to gross revenue like discounts, returns, and allowances",
  },
  {
    id: accountElementIds.costOfSales,
    key: "cost_of_sales",
    label: "Cost of Sales",
    default_side: "debit",
    parent_id: accountElementIds.expenses,
    financial_statement_id: financialStatementIds.is,
    description: "Direct costs tied to production or services",
  },
  {
    id: accountElementIds.opex,
    key: "operating_expenses",
    label: "Operating Expenses",
    default_side: "debit",
    parent_id: accountElementIds.expenses,
    financial_statement_id: financialStatementIds.is,
    description: "Ongoing expenses like SG&A, payroll, rent, utilities etc.",
  },
  {
    id: accountElementIds.nonOpex,
    key: "non_operating_expenses",
    label: "Non-operating Expenses",
    default_side: "debit",
    parent_id: accountElementIds.expenses,
    financial_statement_id: financialStatementIds.is,
    description: "Non-recurring or unusual expenses",
  },
];

const defaultAccountElements: NewAccountElementWithId[] = [
  ...parentAccountElements,
  ...childrenAccountElements,
];

export async function seed(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx("account_element")
      .insert(defaultAccountElements)
      .onConflict()
      .ignore();

    if (process.env.NODE_ENV !== "production") {
      console.log(`Seeded ${parentAccountElements.length} parent elements`);
      console.log(`Seeded ${childrenAccountElements.length} child elements`);
    }
  });
}
