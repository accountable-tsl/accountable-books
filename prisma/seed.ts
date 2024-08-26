import { PrismaClient } from "@prisma/client";
import fs from "fs";
import csv from "csv-parser";
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
import { normalizeData } from "../utils/utils";
import bankData from "./data/banks.json";
import countriesData from "./data/countries.json";
import currenciesData from "./data/currencies.json";
import { createCompanyWithCOA } from "../utils/createCompanyWithCOA";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT;
const BACKEND_URL = process.env.BACKEND_URL;
const baseUrl = `${BACKEND_URL}:${PORT}`;

async function seedDefaultCOAFromCSV(): Promise<void> {
  const defaultCOAFilePath = path.join(
    __dirname,
    "data",
    "DefaultCOATemplate.csv"
  );
  const defaultCOAData: any[] = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(defaultCOAFilePath)
      .pipe(csv())
      .on("data", (data: { [key: string]: string }) => {
        const normalizedData = normalizeData(data);
        if (normalizedData.accountname && normalizedData.accounttypeid) {
          defaultCOAData.push(normalizedData);
        }
      })
      .on("error", (error) => {
        console.error("Error reading CSV file:", error);
      })
      .on("end", async () => {
        console.log("CSV file successfully processed");
        try {
          for (let data of defaultCOAData) {
            await prisma.coaTemplate.create({
              data: {
                templateName: "Default Template",
                accountCode: data.accountcode,
                accountName: data.accountname,
                accountTypeId: parseInt(data.accounttypeid),
                defaultSide: data.defaultside as "Debit" | "Credit",
                description: data.description,
              },
            });
          }
          console.log("CSV data seeded successfully");
          resolve();
        } catch (error) {
          console.error("Error seeding data:", error);
          reject(error);
        }
      });
  });
}

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
  const currencies = await prisma.currency.createMany({
    data: currenciesData,
  });

  const countries = await prisma.country.createMany({
    data: countriesData,
    skipDuplicates: true,
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
    },
  });

  //Companies
  // const testCompany = await prisma.company.create({
  //   data: {
  //     name: "Test Company 1",
  //     countryId: 1,
  //     reportingCurrencyId: 1,
  //     createdById: adminUser.id,
  //   },
  // });

  // Associate the admin user with the company through UserCompany
  // await prisma.userCompany.create({
  //   data: {
  //     userId: adminUser.id,
  //     companyId: testCompany.id,
  //     role: "admin",
  //   },
  // });

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
      elementName: "Share Capital",
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
      elementName: "Income",
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
        typeName: "Accumulated Depreciation - PPE",
        accountElementId: contraAsset.id,
        description:
          "Cumulative depreciation of Property, Plant, and Equipment over their useful life",
      },
      {
        typeName: "Leased Assets",
        accountElementId: fixedAsset.id,
        description:
          "Right-of-use assets from long-term lease agreements under IFRS 16 or ASC 842",
      },
      {
        typeName: "Accumulated Depreciation and Amortisation - Leased Assets",
        accountElementId: contraAsset.id,
        description: "Cumulative depreciation or amortization of leased assets",
      },
      {
        typeName: "Intangible Assets",
        accountElementId: fixedAsset.id,
        description:
          "Non-physical long-term assets such as patents, trademarks, and goodwill",
      },
      {
        typeName: "Accumulated Amortisation - Intangible Assets",
        accountElementId: contraAsset.id,
        description:
          "Cumulative amortization of intangible assets over their useful life",
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
        typeName: "Accounts Receivables",
        accountElementId: currentAsset.id,
        description:
          "Amounts owed to the company by customers for goods or services provided on credit",
      },
      {
        typeName: "Other Contra Assets",
        accountElementId: contraAsset.id,
        description: "Contra Assets",
      },
      {
        typeName: "Contract Assets",
        accountElementId: currentAsset.id,
        description:
          "Rights to payment for goods or services that have been delivered but not yet invoiced or billed to the customer",
      },
      {
        typeName: "Other Receivables",
        accountElementId: currentAsset.id,
        description:
          "Any other amounts owed to the company outside of trade receivables, such as tax refunds, interest receivables, or employee advances",
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
        typeName: "Accruals and Other Payables",
        accountElementId: currentLiab.id,
        description:
          "Expenses incurred but not yet paid, and other short-term obligations such as wages payable or taxes due",
      },
      {
        typeName: "Deferred Revenue (Contract Liabilities)",
        accountElementId: currentLiab.id,
        description:
          "Payments or Deposits received in advance for goods, services or projects that have not yet been delivered. Represents obligations to provide products or services in the future",
      },
      {
        typeName: "Short Term Loans",
        accountElementId: currentLiab.id,
        description:
          "Borrowed funds due for repayment within one year, including bank overdrafts and short-term credit lines",
      },
      {
        typeName: "Tax Payable",
        accountElementId: currentLiab.id,
        description:
          "Short-term tax obligations, typically due within one year",
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
        accountElementId: capital.id,
        description:
          "Value of issued shares representing ownership in the company",
      },
      {
        typeName: "Retained Earnings",
        accountElementId: reserves.id,
        description:
          "Cumulative profits or losses not distributed to shareholders",
      },
      {
        typeName: "Other Comprehensive Income (OCI)",
        accountElementId: otherEquity.id,
        description: "Accumulated Other Comprehensive Income",
      },
      {
        typeName: "Other Components of Equity",
        accountElementId: otherEquity.id,
        description: "All other components of equity including OCI",
      },
    ],
  });

  const incomeTypes = await prisma.accountType.createMany({
    data: [
      {
        typeName: "Income",
        accountElementId: revenue.id,
        description:
          "Income from primary business activities, including sales and services",
      },
      {
        typeName: "Contra-Revenue",
        accountElementId: contraRevenue.id,
        description: "Reductions in price offered to customers on sales",
      },
      {
        typeName: "Finance Income",
        accountElementId: otherIncome.id,
        description: "Income from sources outside primary business activities",
      },
      {
        typeName: "Non-operating Income",
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
        typeName: "Employee Benefits",
        accountElementId: opex.id,
        description: "Wages, salaries, and benefits paid to employees",
      },
      {
        typeName: "Marketing and Advertising",
        accountElementId: opex.id,
        description:
          "Costs associated with promoting the company's products or services",
      },
      {
        typeName: "Rent, Insurance and Utilities",
        accountElementId: opex.id,
        description:
          "Expenses for rent, insurance, and utilities used for business operations",
      },
      {
        typeName: "Repairs and Maintenance",
        accountElementId: opex.id,
        description: "Costs for maintaining and repairing company-owned assets",
      },
      {
        typeName: "Professional Fees",
        accountElementId: opex.id,
        description:
          "Fees paid to external professionals, such as lawyers and consultants",
      },
      {
        typeName: "Telephone, Internet and Software Expenses",
        accountElementId: opex.id,
        description:
          "Costs for telecommunications, internet services, and software used in business operations",
      },
      {
        typeName: "Transport and Travel",
        accountElementId: opex.id,
        description:
          "Expenses related to employee transportation and business travel",
      },
      {
        typeName: "Depreciation and Amortisation",
        accountElementId: opex.id,
        description:
          "The allocation of the cost of tangible and intangible assets over their useful life",
      },
      {
        typeName: "Other General and Administrative Expenses",
        accountElementId: opex.id,
        description:
          "Miscellaneous expenses related to the general running of the business",
      },
      {
        typeName: "Finance Costs",
        accountElementId: nonOpex.id,
        description:
          "Costs incurred from borrowing funds, including interest and other charges",
      },
      {
        typeName: "Non-Operating Expenses",
        accountElementId: nonOpex.id,
        description: "Expenses not related to core business operations",
      },
      {
        typeName: "Tax Expense",
        accountElementId: nonOpex.id,
        description: "Income taxes payable by the company on its earnings",
      },
    ],
  });

  await seedDefaultCOAFromCSV();

  for (const bank of bankData) {
    await prisma.bank.create({
      data: {
        name: bank.name,
        bankLogo: `${baseUrl}${bank.bankLogo}`,
        countryId: 1,
      },
    });
  }

  const testCompany = await createCompanyWithCOA(
    {
      name: "Demo Company",
      countryId: 1,
      reportingCurrencyId: 1,
    },
    adminUser.id
  );

  if (testCompany.success && testCompany.company) {
    await prisma.userCompany.create({
      data: {
        user: { connect: { id: adminUser.id } },
        company: { connect: { id: testCompany.company.id } },
        role: "admin",
      },
    });

    await prisma.company.update({
      where: {
        id: testCompany.company.id,
      },
      data: {
        website: "https://www.democompany.com",
        industry: "Technology",
        teamSize: "50-100",
        revenue: "1M-5M USD",
      },
    });
  }
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
