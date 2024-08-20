import { PrismaClient } from "@prisma/client";
import { connect } from "http2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

interface CoaData {
  Account: string;
  accountTypeName: string;
  currencyId: number;
  companyId: number;
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coa1Path = path.join(__dirname, "./data/coa-1.json");
const coa1 = JSON.parse(fs.readFileSync(coa1Path, "utf-8"));

const coa2Path = path.join(__dirname, "./data/coa-2.json");
const coa2 = JSON.parse(fs.readFileSync(coa2Path, "utf-8"));

console.log(coa1, coa2);

async function main() {
  //Roles
  const adminRole = await prisma.role.create({
    data: {
      name: "admin",
      description: "Administrator role with full access",
    },
  });

  const accountantRole = await prisma.role.create({
    data: {
      name: "accountant",
      description: "Accounting firm users",
    },
  });

  const clientRole = await prisma.role.create({
    data: {
      name: "client",
      description: "clients",
    },
  });

  //Currencies
  const nairaCurrency = await prisma.currency.create({
    data: {
      name: "Naira",
      code: "NGN",
      symbol: "₦",
    },
  });

  //Companies
  const testCompany = await prisma.company.create({
    data: {
      name: "Test Company 1",
      country: "Nigeria",
      reportingCurrencyId: nairaCurrency.id,
    },
  });

  //Users
  const adminUser = await prisma.user.upsert({
    where: { email: "a.adenuga@accountable.global" },
    update: {},
    create: {
      firstname: "Temi",
      lastname: "Adenuga",
      email: "a.adenuga@accountable.global",
      password: "securepassword",
      role: {
        connect: { id: adminRole.id },
      },
      companies: {
        create: {
          companyId: testCompany.id,
          role: "admin",
        },
      },
    },
  });

  //COA
  const balanceSheet = await prisma.financialStatement.create({
    data: {
      statementKey: "balance_sheet",
      usGaapLabel: "Balance Sheet",
      ifrsLabel: "Statement of Financial Position",
      defaultLabel: "Balance Sheet",
    },
  });

  const incomeStatement = await prisma.financialStatement.create({
    data: {
      statementKey: "income_statement",
      usGaapLabel: "Income Statement",
      ifrsLabel: "Statement of Profit or Loss and Other Comprehensive Income",
      defaultLabel: "Income Statement",
    },
  });

  const asset = await prisma.accountElement.create({
    data: {
      elementName: "Assets",
      parentId: null,
      financialStatementId: balanceSheet.id,
      description: "All asset accounts",
      defaultSide: "Debit",
    },
  });

  const liabilities = await prisma.accountElement.create({
    data: {
      elementName: "Liabilities",
      parentId: null,
      financialStatementId: balanceSheet.id,
      description: "All liability accounts",
      defaultSide: "Credit",
    },
  });

  const equity = await prisma.accountElement.create({
    data: {
      elementName: "Equity",
      parentId: null,
      financialStatementId: balanceSheet.id,
      description: "Ownership interest",
      defaultSide: "Credit",
    },
  });

  const income = await prisma.accountElement.create({
    data: {
      elementName: "Income",
      parentId: null,
      financialStatementId: incomeStatement.id,
      description: "All income and revenue accounts",
      defaultSide: "Credit",
    },
  });

  const expenses = await prisma.accountElement.create({
    data: {
      elementName: "Expenses",
      parentId: null,
      financialStatementId: incomeStatement.id,
      description: "All expenses, cost of sales, etc",
      defaultSide: "Debit",
    },
  });

  const currentAsset = await prisma.accountElement.create({
    data: {
      elementName: "Current Asset",
      parentId: asset.id, // Child of Asset
      financialStatementId: balanceSheet.id,
      description:
        "Short-term, liquid assets like cash, receivables, inventory",
      defaultSide: "Debit",
    },
  });

  const fixedAsset = await prisma.accountElement.create({
    data: {
      elementName: "Fixed Asset",
      parentId: asset.id, // Child of Asset
      financialStatementId: balanceSheet.id,
      description: "Long-term physical assets like property and equipment",
      defaultSide: "Debit",
    },
  });

  const contraAsset = await prisma.accountElement.create({
    data: {
      elementName: "Contra Asset",
      parentId: asset.id, // Child of Asset
      financialStatementId: balanceSheet.id,
      description:
        "Accounts that offset asset balances, such as accumulated depreciation",
      defaultSide: "Credit",
    },
  });

  const nonCurrentAsset = await prisma.accountElement.create({
    data: {
      elementName: "Noncurrent Asset",
      parentId: asset.id, // Child of Asset
      financialStatementId: balanceSheet.id,
      description: "Long-term investments, intangibles",
      defaultSide: "Debit",
    },
  });

  const currentLiab = await prisma.accountElement.create({
    data: {
      elementName: "Current Liabilities",
      parentId: liabilities.id, // Child of Liabilities
      financialStatementId: balanceSheet.id,
      description:
        "Short-term liabilities like accounts payable, short-term debt",
      defaultSide: "Credit",
    },
  });

  const nonCurrentLiab = await prisma.accountElement.create({
    data: {
      elementName: "Noncurrent Liabilities",
      parentId: liabilities.id, // Child of Liabilities
      financialStatementId: balanceSheet.id,
      description: "Long-term liabilities like long-term debt, deferred taxes",
      defaultSide: "Credit",
    },
  });

  const capital = await prisma.accountElement.create({
    data: {
      elementName: "Capital",
      parentId: equity.id,
      financialStatementId: balanceSheet.id,
      description: "Paid-in capital",
      defaultSide: "Credit",
    },
  });

  const reserves = await prisma.accountElement.create({
    data: {
      elementName: "Reserves",
      parentId: equity.id,
      financialStatementId: balanceSheet.id,
      description: "Retained Earnings and Other Reserves",
      defaultSide: "Credit",
    },
  });

  const otherEquity = await prisma.accountElement.create({
    data: {
      elementName: "Other Equity",
      parentId: equity.id,
      financialStatementId: balanceSheet.id,
      description:
        "Accumulated Other Comprehensive Income and other components of equity",
      defaultSide: "Credit",
    },
  });

  const revenue = await prisma.accountElement.create({
    data: {
      elementName: "Revenue",
      parentId: income.id,
      financialStatementId: incomeStatement.id,
      description:
        "Income from primary business activities, including sales and services",
      defaultSide: "Credit",
    },
  });

  const otherIncome = await prisma.accountElement.create({
    data: {
      elementName: "Other Income",
      parentId: income.id,
      financialStatementId: incomeStatement.id,
      description: "Income from sources outside primary business activities",
      defaultSide: "Credit",
    },
  });

  const contraRevenue = await prisma.accountElement.create({
    data: {
      elementName: "Contra Revenue",
      parentId: income.id,
      financialStatementId: incomeStatement.id,
      description: "Contra Revenue",
      defaultSide: "Debit",
    },
  });

  const costOfSales = await prisma.accountElement.create({
    data: {
      elementName: "Cost of Sales",
      parentId: expenses.id, // Child of Expenses
      financialStatementId: incomeStatement.id,
      description: "Direct costs tied to production or services",
      defaultSide: "Debit",
    },
  });

  const opex = await prisma.accountElement.create({
    data: {
      elementName: "Operating Expenses",
      parentId: expenses.id, // Child of Expenses
      financialStatementId: incomeStatement.id,
      description: "Ongoing expenses like payroll, rent, utilities",
      defaultSide: "Debit",
    },
  });

  const nonOpex = await prisma.accountElement.create({
    data: {
      elementName: "Nonoperating Expenses",
      parentId: expenses.id, // Child of Expenses
      financialStatementId: incomeStatement.id,
      description: "Non-recurring or unusual expenses",
      defaultSide: "Debit",
    },
  });

  const nonCurrentAssets = await prisma.accountType.createMany({
    data: [
      {
        typeName: "Property, Plant, Equipment",
        accountElementId: fixedAsset.id,
        description:
          "Tangible long-term assets used in business operations, including buildings, machinery, and vehicles",
      },
      {
        typeName: "Accumulated Depreciation and Amortisation",
        accountElementId: contraAsset.id,
        description:
          "Cumulative decrease in value of tangible and intangible assets over their useful life",
      },
      {
        typeName: "Other Noncurrent Assets",
        accountElementId: nonCurrentAsset.id,
        description:
          "Long-term assets not classified elsewhere, including deferred tax assets and long-term investments",
      },
    ],
  });

  const currentAssets = await prisma.accountType.createMany({
    data: [
      {
        typeName: "Bank",
        accountElementId: currentAsset.id,
        description:
          "Cash held in company bank accounts, including checking and savings accounts",
      },
      {
        typeName: "Accounts Receivables",
        accountElementId: currentAsset.id,
        description:
          "Amounts owed to the company by customers for goods or services provided on credit",
      },
      {
        typeName: "Investments and Cash Equivalents",
        accountElementId: currentAsset.id,
        description:
          "Short-term, highly liquid investments that are readily convertible to cash",
      },
      {
        typeName: "Inventory",
        accountElementId: currentAsset.id,
        description:
          "Goods held for sale, raw materials, and work-in-progress items",
      },
      {
        typeName: "Prepayments",
        accountElementId: currentAsset.id,
        description:
          "Expenses paid in advance for future goods or services, such as insurance or rent",
      },
      {
        typeName: "Other Current Assets",
        accountElementId: currentAsset.id,
        description:
          "Short-term assets not classified elsewhere, typically convertible to cash within one year",
      },
    ],
  });

  const nonCurrentLiabilities = await prisma.accountType.createMany({
    data: [
      {
        typeName: "Long Term Loans",
        accountElementId: nonCurrentLiab.id,
        description:
          "Borrowed funds with repayment terms extending beyond one year, such as mortgages or long-term bank loans",
      },
      {
        typeName: "Other Long-Term Liabilities",
        accountElementId: nonCurrentLiab.id,
        description:
          "Non-current obligations not classified elsewhere, including deferred tax liabilities and long-term lease obligations",
      },
    ],
  });

  const currentLiabilities = await prisma.accountType.createMany({
    data: [
      {
        typeName: "Account Payables",
        accountElementId: currentLiab.id,
        description:
          "Amounts owed by the company to suppliers for goods or services purchased on credit",
      },
      {
        typeName: "Short Term Loans",
        accountElementId: currentLiab.id,
        description:
          "Borrowed funds due for repayment within one year, including bank overdrafts and short-term credit lines",
      },
      {
        typeName: "Accruals and Other Payables",
        accountElementId: currentLiab.id,
        description:
          "Expenses incurred but not yet paid, and other short-term obligations such as wages payable or taxes due",
      },
      {
        typeName: "Other Current Liabilities",
        accountElementId: currentLiab.id,
        description:
          "Short-term obligations not classified elsewhere, typically due within one year, such as unearned revenue or current portions of long-term debt",
      },
    ],
  });

  const equityTypes = await prisma.accountType.createMany({
    data: [
      {
        typeName: "Share Capital",
        accountElementId: equity.id,
        description:
          "Value of issued shares representing ownership in the company",
      },
      {
        typeName: "Retained Earnings",
        accountElementId: equity.id,
        description:
          "Cumulative profits or losses not distributed to shareholders",
      },
      {
        typeName: "Other Components of Equity",
        accountElementId: equity.id,
        description: "All other components of equity including OCI",
      },
    ],
  });

  const incomeTypes = await prisma.accountType.createMany({
    data: [
      {
        typeName: "Revenue",
        accountElementId: revenue.id,
        description:
          "Income from primary business activities, including sales and services",
      },
      {
        typeName: "Discount Allowed",
        accountElementId: contraRevenue.id,
        description: "Reductions in price offered to customers on sales",
      },
      {
        typeName: "Other Income",
        accountElementId: otherIncome.id,
        description: "Income from sources outside primary business activities",
      },
    ],
  });

  const expenseTypes = await prisma.accountType.createMany({
    data: [
      {
        typeName: "Cost of Sales",
        accountElementId: costOfSales.id,
        description:
          "Direct costs incurred in the production or acquisition of goods sold",
      },
      {
        typeName: "Payroll Expenses",
        accountElementId: opex.id,
        description: "Wages, salaries, and benefits paid to employees",
      },
      {
        typeName: "Selling, General and Administrative Expenses",
        accountElementId: opex.id,
        description: "Expenses related to general business operations",
      },
      {
        typeName: "Depreciation and Amortisation Expense",
        accountElementId: opex.id,
        description:
          "Expense related to the allocation of the cost of tangible and intangible assets over their useful life",
      },
      {
        typeName: "Other Expenses",
        accountElementId: opex.id,
        description: "Expenses related to general business operations",
      },
      {
        typeName: "Non-Operating Expenses",
        accountElementId: nonOpex.id,
        description: "Expenses not related to core business operations",
      },
    ],
  });

  for (const item of coa1) {
    try {
      await prisma.coa.create({
        data: {
          accountName: item.Account,
          accountType: item.accountTypeName,
          currencyId: item.currencyId,
          companyId: item.companyId,
        },
      });
    } catch (error) {
      console.error("Error seeding COA:", error);
    }
  }

  for (const item of coa2) {
    try {
      await prisma.coa.create({
        data: {
          accountCode: item.accountCode,
          accountName: item.Account,
          accountType: item.accountTypeName,
          currencyId: item.currencyId,
          companyId: item.companyId,
        },
      });
    } catch (error) {
      console.error("Error seeding COA:", error);
    }
  }

  console.log(
    adminRole,
    accountantRole,
    clientRole,
    nairaCurrency,
    testCompany,
    adminUser,
    asset,
    liabilities,
    equity,
    income,
    expenses,
    currentAsset,
    fixedAsset,
    nonCurrentAsset,
    currentLiab,
    nonCurrentLiab,
    costOfSales,
    opex,
    nonOpex,
    nonCurrentAssets,
    currentAssets,
    nonCurrentLiabilities,
    currentLiabilities,
    equityTypes,
    incomeTypes,
    expenseTypes
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
