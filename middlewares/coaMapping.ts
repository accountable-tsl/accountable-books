// import {
//   AccountType,
//   AccountElement,
//   FinancialStatement,
// } from "@prisma/client";

// const coaMapping = (
//   accountType: AccountType
// ): { element: AccountElement; financialStatement: FinancialStatement } => {
//   switch (accountType) {
//     case "Bank":
//     case "Investments and Cash Equivalents":
//     case "Inventory":
//     case "Accounts Receivables":
//     case "Other Contra Assets":
//     case "Contract Assets":
//     case "Other Receivables":
//     case "Prepayments":
//     case "Other Current Assets":
//       return {
//         AccountElement: "Current Asset",
//         FinancialStatement: "BALANCE_SHEET",
//       };

//     case "Property, Plant, Equipment":
//     case "Leased Assets":
//     case "Intangible Assets":
//     case "Other Noncurrent Assets":
//       return {
//         AccountElement: "Fixed Asset",
//         FinancialStatement: "BALANCE_SHEET",
//       };

//     case "Noncurrent Assets":
//       return {
//         AccountElement: "Noncurrent Asset",
//         FinancialStatement: "BALANCE_SHEET",
//       };

//     case "Accumulated Depreciation - PPE":
//     case "Accumulated Depreciation and Amortisation - Leased Assets":
//     case "Accumulated Amortisation - Intangible Assets":
//       return {
//         AccountElement: "Contra Asset",
//         FinancialStatement: "BALANCE_SHEET",
//       };

//     case "current_liabilities":
//     case "noncurrent_liabilities":
//       return {
//         AccountElement: "liabilities",
//         FinancialStatement: "BALANCE_SHEET",
//       };

//     case "revenue":
//     case "income":
//     case "other_income":
//     case "finance_income":
//       return {
//         AccountElement: "revenue",
//         FinancialStatement: "INCOME_STATEMENT",
//       };

//     case "cost_of_sales":
//     case "operating_expenses":
//     case "noncash_charges":
//     case "depreciation":
//     case "amortisation":
//     case "finance_costs":
//     case "tax_expense":
//       return {
//         AccountElement: "expense",
//         FinancialStatement: "INCOME_STATEMENT",
//       };

//     case "equity":
//       return { AccountElement: "equity", FinancialStatement: "BALANCE_SHEET" };

//     default:
//       throw new Error("Invalid account type");
//   }
// };
