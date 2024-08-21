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
//         FinancialStatement: "balance_sheet",
//       };

//     case "Property, Plant, Equipment":
//     case "Leased Assets":
//     case "Intangible Assets":
//     case "Other Noncurrent Assets":
//       return {
//         AccountElement: "Fixed Asset",
//         FinancialStatement: "balance_sheet",
//       };

//     case "Noncurrent Assets":
//       return {
//         AccountElement: "Noncurrent Asset",
//         FinancialStatement: "balance_sheet",
//       };

//     case "Accumulated Depreciation - PPE":
//     case "Accumulated Depreciation and Amortisation - Leased Assets":
//     case "Accumulated Amortisation - Intangible Assets":
//       return {
//         AccountElement: "Contra Asset",
//         FinancialStatement: "balance_sheet",
//       };

//     case "current_liabilities":
//     case "noncurrent_liabilities":
//       return {
//         AccountElement: "liabilities",
//         FinancialStatement: "balance_sheet",
//       };

//     case "revenue":
//     case "income":
//     case "other_income":
//     case "finance_income":
//       return {
//         AccountElement: "revenue",
//         FinancialStatement: "income_statement",
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
//         FinancialStatement: "income_statement",
//       };

//     case "equity":
//       return { AccountElement: "equity", FinancialStatement: "balance_sheet" };

//     default:
//       throw new Error("Invalid account type");
//   }
// };
