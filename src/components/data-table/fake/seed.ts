import { faker } from "@faker-js/faker";

export interface Account {
  id: string;
  companyId: string;
  accountCode: string;
  accountName: string;
  accountType: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
  accountCategory: string;
  status: "active" | "inactive" | "archived";
  description: string;
  normalBalance: "Debit" | "Credit";
  currency: string;
  currentBalance: string;
  isBudgetControlled: boolean;
  createdAt: string;
  updatedAt: string;
  isTaxRelevant: boolean;
}
// Define account types and categories
const accountTypes = [
  "Asset",
  "Liability",
  "Equity",
  "Revenue",
  "Expense",
] as const;
const accountCategories = {
  Asset: ["Current Assets", "Fixed Assets", "Investments", "Other Assets"],
  Liability: [
    "Current Liabilities",
    "Long-Term Liabilities",
    "Other Liabilities",
  ],
  Equity: ["Common Stock", "Retained Earnings", "Other Equity"],
  Revenue: ["Operating Revenue", "Non-Operating Revenue"],
  Expense: [
    "Cost of Goods Sold",
    "Operating Expenses",
    "Financial Expenses",
    "Taxes",
  ],
} as const;

// Define account statuses
const statuses = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
] as const;

// Define currencies
const currencies = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
] as const;

// Account name generators per category
const accountNameGenerators = {
  "Current Assets": () =>
    faker.helpers.arrayElement([
      "Cash and Cash Equivalents",
      "Accounts Receivable",
      "Inventory",
      "Prepaid Expenses",
      "Marketable Securities",
    ]),
  "Fixed Assets": () =>
    faker.helpers.arrayElement([
      "Property, Plant and Equipment",
      "Furniture and Fixtures",
      "Leasehold Improvements",
      "Accumulated Depreciation",
    ]),
  Investments: () =>
    faker.helpers.arrayElement([
      "Long-Term Investments",
      "Held-to-Maturity Securities",
      "Available-for-Sale Securities",
    ]),
  "Current Liabilities": () =>
    faker.helpers.arrayElement([
      "Accounts Payable",
      "Short-Term Debt",
      "Accrued Liabilities",
      "Unearned Revenue",
    ]),
  "Long-Term Liabilities": () =>
    faker.helpers.arrayElement([
      "Long-Term Debt",
      "Bonds Payable",
      "Deferred Tax Liabilities",
      "Lease Obligations",
    ]),
  "Common Stock": () => "Common Stock",
  "Retained Earnings": () => "Retained Earnings",
  "Operating Revenue": () =>
    faker.helpers.arrayElement([
      "Product Sales",
      "Service Revenue",
      "Royalty Income",
      "Subscription Revenue",
    ]),
  "Cost of Goods Sold": () =>
    faker.helpers.arrayElement([
      "Raw Materials",
      "Direct Labor",
      "Manufacturing Overhead",
      "Inventory Write-Down",
    ]),
  "Operating Expenses": () =>
    faker.helpers.arrayElement([
      "Salaries and Wages",
      "Rent Expense",
      "Utilities",
      "Marketing and Advertising",
      "Research and Development",
    ]), // Fallback generator for other categories
  default: (category: string) =>
    `${category} Account ${faker.number.int({ min: 1, max: 100 })}`,
};

export const generateCompanyAccounts = (
  companyId: string,
  count: number = 500
): Account[] => {
  const accounts = [];

  for (let i = 0; i < count; i++) {
    const type = faker.helpers.arrayElement(
      accountTypes
    ) as keyof typeof accountCategories;
    const category = faker.helpers.arrayElement(accountCategories[type]);
    const nameGenerator =
      accountNameGenerators[category as keyof typeof accountNameGenerators] ||
      accountNameGenerators.default;

    accounts.push({
      id: faker.string.uuid(),
      companyId,
      accountCode: `${type.substring(0, 1)}${faker.number.int({
        min: 1000,
        max: 9999,
      })}`,
      accountName: nameGenerator(category),
      accountType: type,
      accountCategory: category,
      status: faker.helpers.arrayElement(statuses).value,
      description: faker.finance.transactionDescription(),
      normalBalance: (type === "Asset" || type === "Expense"
        ? "Debit"
        : "Credit") as "Debit" | "Credit",
      currency: faker.helpers.arrayElement(currencies).code,
      currentBalance: faker.finance.amount({ min: 0, max: 1000000, dec: 2 }),
      isBudgetControlled: faker.datatype.boolean({ probability: 0.7 }),
      createdAt: faker.date.past({ years: 2 }).toISOString(),
      updatedAt: faker.date.recent({ days: 90 }).toISOString(),
      isTaxRelevant: faker.datatype.boolean({ probability: 0.4 }),
    });
  }

  return accounts;
};
