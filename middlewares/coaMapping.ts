import {
  AccountType,
  AccountElement,
  FinancialStatement,
} from "@prisma/client";

const coaMapping = (
  accountType: AccountType
): { element: AccountElement; financialStatement: FinancialStatement } => {
  switch (accountType) {
    case "bank":
    case "current_assets":
    case "noncurrent_assets":
    case "fixed_assets":
      return { element: "asset", financialStatement: "balance_sheet" };

    case "current_liabilities":
    case "noncurrent_liabilities":
      return { element: "liabilities", financialStatement: "balance_sheet" };

    case "revenue":
    case "income":
    case "other_income":
    case "finance_income":
      return { element: "revenue", financialStatement: "income_statement" };

    case "cost_of_sales":
    case "operating_expenses":
    case "noncash_charges":
    case "depreciation":
    case "amortisation":
    case "finance_costs":
    case "tax_expense":
      return { element: "expense", financialStatement: "income_statement" };

    case "equity":
      return { element: "equity", financialStatement: "balance_sheet" };

    default:
      throw new Error("Invalid account type");
  }
};
