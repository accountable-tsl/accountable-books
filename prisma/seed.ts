import { FsKey, PrismaClient } from "@prisma/client";
import fs from "fs";
import csv from "csv-parser";
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
import { normalizeData } from "../utils/utils";
import bankData from "./data/banks.json";
import countriesData from "./data/countries.json";
import currenciesData from "./data/currencies.json";
import { createNewExRates } from "../models/exRateModel";
import { Decimal } from "@prisma/client/runtime/library";
import {
  CreateBankData,
  createNewBankAccount,
} from "../models/bankAccountModel";
import { createACompany } from "../models/companiesModel";

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
        const normalisedData = normalizeData(data);
        if (normalisedData.accountname && normalisedData.accounttypeid) {
          defaultCOAData.push(normalisedData);
        }
      })
      .on("error", (error) => {
        console.error("Error reading CSV file:", error);
      })
      .on("end", async () => {
        try {
          for (let data of defaultCOAData) {
            await prisma.coaTemplate.create({
              data: {
                templateName: "Default Template",
                accountCode: data.accountcode,
                accountName: data.accountname,
                accountTypeId: data.accounttypeid,
                defaultSide: data.defaultside as "DEBIT" | "CREDIT",
                description: data.description,
                fsKey: data.fsKey as FsKey,
              },
            });
          }
          resolve();
        } catch (error) {
          console.error("Error seeding data:", error);
          reject(error);
        }
      });
  });
}

async function seedExchangeRates(): Promise<void> {
  const exRateFilePath = path.join(__dirname, "data", "ng_exrates.csv");
  const exchangeRateData: any[] = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(exRateFilePath)
      .pipe(csv())
      .on("data", (data: { [key: string]: string }) => {
        if (
          data.date &&
          data.fromCurrencyId &&
          data.toCurrencyId &&
          data.rate
        ) {
          exchangeRateData.push({
            date: new Date(data.date),
            fromCurrencyId: data.fromCurrencyId,
            toCurrencyId: data.toCurrencyId,
            rate: new Decimal(data.rate),
          });
        }
      })
      .on("error", (error) => {
        console.error("Error reading CSV file:", error);
        reject(error);
      })
      .on("end", async () => {
        try {
          const result = await createNewExRates(exchangeRateData);
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
      id: "testId",
      firstname: "Temi",
      lastname: "Adenuga",
      email: "a.adenuga@accountable.global",
      password: "securepassword",
      role: {
        connect: { id: adminRole.id },
      },
    },
  });

  const seedAccountTypes = async () => {
    const balanceSheet = await prisma.financialStatement.create({
      data: {
        statementKey: "BALANCE_SHEET",
        usGaapLabel: "Balance Sheet",
        ifrsLabel: "Statement of Financial Position",
        defaultLabel: "Balance Sheet",
      },
    });

    const incomeStatement = await prisma.financialStatement.create({
      data: {
        statementKey: "INCOME_STATEMENT",
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
        defaultSide: "DEBIT",
      },
    });

    const liabilities = await prisma.accountElement.create({
      data: {
        elementName: "Liabilities",
        parentId: null,
        financialStatementId: balanceSheet.id,
        description: "All liability accounts",
        defaultSide: "CREDIT",
      },
    });

    const equity = await prisma.accountElement.create({
      data: {
        elementName: "Equity",
        parentId: null,
        financialStatementId: balanceSheet.id,
        description: "Ownership interest",
        defaultSide: "CREDIT",
      },
    });

    const income = await prisma.accountElement.create({
      data: {
        elementName: "Income",
        parentId: null,
        financialStatementId: incomeStatement.id,
        description: "All income and revenue accounts",
        defaultSide: "CREDIT",
      },
    });

    const expenses = await prisma.accountElement.create({
      data: {
        elementName: "Expenses",
        parentId: null,
        financialStatementId: incomeStatement.id,
        description: "All expenses, cost of sales, etc",
        defaultSide: "DEBIT",
      },
    });

    const currentAsset = await prisma.accountElement.create({
      data: {
        elementName: "Current Asset",
        parentId: asset.id, // Child of Asset
        financialStatementId: balanceSheet.id,
        description:
          "Short-term, liquid assets like cash, receivables, inventory",
        defaultSide: "DEBIT",
      },
    });

    const fixedAsset = await prisma.accountElement.create({
      data: {
        elementName: "Fixed Asset",
        parentId: asset.id, // Child of Asset
        financialStatementId: balanceSheet.id,
        description: "Long-term physical assets like property and equipment",
        defaultSide: "DEBIT",
      },
    });

    const contraAsset = await prisma.accountElement.create({
      data: {
        elementName: "Contra Asset",
        parentId: asset.id, // Child of Asset
        financialStatementId: balanceSheet.id,
        description:
          "Accounts that offset asset balances, such as accumulated depreciation",
        defaultSide: "CREDIT",
      },
    });

    const nonCurrentAsset = await prisma.accountElement.create({
      data: {
        elementName: "Noncurrent Asset",
        parentId: asset.id, // Child of Asset
        financialStatementId: balanceSheet.id,
        description: "Long-term investments, intangibles",
        defaultSide: "DEBIT",
      },
    });

    const currentLiab = await prisma.accountElement.create({
      data: {
        elementName: "Current Liabilities",
        parentId: liabilities.id, // Child of Liabilities
        financialStatementId: balanceSheet.id,
        description:
          "Short-term liabilities like accounts payable, short-term debt",
        defaultSide: "CREDIT",
      },
    });

    const nonCurrentLiab = await prisma.accountElement.create({
      data: {
        elementName: "Noncurrent Liabilities",
        parentId: liabilities.id, // Child of Liabilities
        financialStatementId: balanceSheet.id,
        description:
          "Long-term liabilities like long-term debt, deferred taxes",
        defaultSide: "CREDIT",
      },
    });

    const capital = await prisma.accountElement.create({
      data: {
        elementName: "Share Capital",
        parentId: equity.id,
        financialStatementId: balanceSheet.id,
        description: "Paid-in capital",
        defaultSide: "CREDIT",
      },
    });

    const reserves = await prisma.accountElement.create({
      data: {
        elementName: "Reserves",
        parentId: equity.id,
        financialStatementId: balanceSheet.id,
        description: "Retained Earnings and Other Reserves",
        defaultSide: "CREDIT",
      },
    });

    const otherEquity = await prisma.accountElement.create({
      data: {
        elementName: "Other Equity",
        parentId: equity.id,
        financialStatementId: balanceSheet.id,
        description:
          "Accumulated Other Comprehensive Income and other components of equity",
        defaultSide: "CREDIT",
      },
    });

    const revenue = await prisma.accountElement.create({
      data: {
        elementName: "Income",
        parentId: income.id,
        financialStatementId: incomeStatement.id,
        description:
          "Income from primary business activities, including sales and services",
        defaultSide: "CREDIT",
      },
    });

    const otherIncome = await prisma.accountElement.create({
      data: {
        elementName: "Other Income",
        parentId: income.id,
        financialStatementId: incomeStatement.id,
        description: "Income from sources outside primary business activities",
        defaultSide: "CREDIT",
      },
    });

    const contraRevenue = await prisma.accountElement.create({
      data: {
        elementName: "Contra Revenue",
        parentId: income.id,
        financialStatementId: incomeStatement.id,
        description: "Contra Revenue",
        defaultSide: "DEBIT",
      },
    });

    const costOfSales = await prisma.accountElement.create({
      data: {
        elementName: "Cost of Sales",
        parentId: expenses.id, // Child of Expenses
        financialStatementId: incomeStatement.id,
        description: "Direct costs tied to production or services",
        defaultSide: "DEBIT",
      },
    });

    const opex = await prisma.accountElement.create({
      data: {
        elementName: "Operating Expenses",
        parentId: expenses.id, // Child of Expenses
        financialStatementId: incomeStatement.id,
        description: "Ongoing expenses like payroll, rent, utilities",
        defaultSide: "DEBIT",
      },
    });

    const nonOpex = await prisma.accountElement.create({
      data: {
        elementName: "Nonoperating Expenses",
        parentId: expenses.id, // Child of Expenses
        financialStatementId: incomeStatement.id,
        description: "Non-recurring or unusual expenses",
        defaultSide: "DEBIT",
      },
    });

    const nonCurrentAssets = await prisma.accountType.createMany({
      data: [
        {
          id: "9d8e5ec9-e9b7-43d6-8dde-b80a552fb64e",
          typeName: "Property, Plant, Equipment",
          accountElementId: fixedAsset.id,
          description:
            "Tangible long-term assets used in business operations, including buildings, machinery, and vehicles",
        },
        {
          id: "276ef71c-10b1-44d2-a6ce-23752b047949",
          typeName: "Accumulated Depreciation - PPE",
          accountElementId: contraAsset.id,
          description:
            "Cumulative depreciation of Property, Plant, and Equipment over their useful life",
        },
        {
          id: "620cb7cb-6283-48d7-840b-81f4b23419f4",
          typeName: "Leased Assets",
          accountElementId: fixedAsset.id,
          description:
            "Right-of-use assets from long-term lease agreements under IFRS 16 or ASC 842",
        },
        {
          id: "4d6d0cb4-66de-4285-9eb4-eec81de03cfc",
          typeName: "Accumulated Depreciation and Amortisation - Leased Assets",
          accountElementId: contraAsset.id,
          description:
            "Cumulative depreciation or amortization of leased assets",
        },
        {
          id: "50a5d1ca-5219-4d43-903e-8d926067a0f1",
          typeName: "Intangible Assets",
          accountElementId: fixedAsset.id,
          description:
            "Non-physical long-term assets such as patents, trademarks, and goodwill",
        },
        {
          id: "7aac324c-1205-477e-a084-112de81c4152",
          typeName: "Accumulated Amortisation - Intangible Assets",
          accountElementId: contraAsset.id,
          description:
            "Cumulative amortization of intangible assets over their useful life",
        },
        {
          id: "0bbb12c0-ebe3-4ad6-879f-c277ed862ad2",
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
          id: "d9c4adcd-add7-4602-a1bc-1edad19da4f0",
          typeName: "Bank",
          accountElementId: currentAsset.id,
          description:
            "Cash held in company bank accounts, including checking and savings accounts",
        },
        {
          id: "4a5d0024-6234-4982-809c-f16e3be7f379",
          typeName: "Investments and Cash Equivalents",
          accountElementId: currentAsset.id,
          description:
            "Short-term, highly liquid investments that are readily convertible to cash",
        },
        {
          id: "10149b24-6827-475d-a657-77497c0856a0",
          typeName: "Inventory",
          accountElementId: currentAsset.id,
          description:
            "Goods held for sale, raw materials, and work-in-progress items",
        },
        {
          id: "d764021a-0847-4be8-a687-9c8195b47f6d",
          typeName: "Accounts Receivables",
          accountElementId: currentAsset.id,
          description:
            "Amounts owed to the company by customers for goods or services provided on credit",
        },
        {
          id: "083d362e-2715-4556-922a-c86a6966bb98",
          typeName: "Other Contra Assets",
          accountElementId: contraAsset.id,
          description: "Contra Assets",
        },
        {
          id: "6c1d4db4-2f10-4c82-9ffa-a4a18e80a3ef",
          typeName: "Contract Assets",
          accountElementId: currentAsset.id,
          description:
            "Rights to payment for goods or services that have been delivered but not yet invoiced or billed to the customer",
        },
        {
          id: "176abf7d-d7d2-46fe-8981-5f3e1ddcf880",
          typeName: "Other Receivables",
          accountElementId: currentAsset.id,
          description:
            "Any other amounts owed to the company outside of trade receivables, such as tax refunds, interest receivables, or employee advances",
        },
        {
          id: "a0328b6e-4257-435f-9533-53ed9ccc2bf2",
          typeName: "Prepayments",
          accountElementId: currentAsset.id,
          description:
            "Expenses paid in advance for future goods or services, such as insurance or rent",
        },
        {
          id: "140e3f60-337b-4bf2-b42d-3c7f37dea88f",
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
          id: "384e10f1-d5a1-429a-86c9-dfc6dc1760c6",
          typeName: "Long Term Loans",
          accountElementId: nonCurrentLiab.id,
          description:
            "Borrowed funds with repayment terms extending beyond one year, such as mortgages or long-term bank loans",
        },
        {
          id: "d01e3dfc-553b-4846-bd44-1078f94c43ee",
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
          id: "7def2082-8695-4d32-a385-2827e46747db",
          typeName: "Account Payables",
          accountElementId: currentLiab.id,
          description:
            "Amounts owed by the company to suppliers for goods or services purchased on credit",
        },
        {
          id: "0db706af-b567-4ce2-b299-ac44c05eb60f",
          typeName: "Accruals and Other Payables",
          accountElementId: currentLiab.id,
          description:
            "Expenses incurred but not yet paid, and other short-term obligations such as wages payable or taxes due",
        },
        {
          id: "f7e721d0-9912-402e-8746-7e9ef55f6cde",
          typeName: "Deferred Revenue (Contract Liabilities)",
          accountElementId: currentLiab.id,
          description:
            "Payments or Deposits received in advance for goods, services or projects that have not yet been delivered. Represents obligations to provide products or services in the future",
        },
        {
          id: "7780f7f0-ad31-44b7-acd1-d39a0a6c01a1",
          typeName: "Short Term Loans",
          accountElementId: currentLiab.id,
          description:
            "Borrowed funds due for repayment within one year, including bank overdrafts and short-term credit lines",
        },
        {
          id: "54506f3f-d065-4068-9b1c-ea81d231543f",
          typeName: "Tax Payable",
          accountElementId: currentLiab.id,
          description:
            "Short-term tax obligations, typically due within one year",
        },
        {
          id: "7a9cea0c-223f-4854-8344-1ceee1436ed3",
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
          id: "39a0bb4a-fae3-4eab-bdac-fcf2794476a5",
          typeName: "Share Capital",
          accountElementId: capital.id,
          description:
            "Value of issued shares representing ownership in the company",
        },
        {
          id: "8f84a613-1b9b-412b-a29e-168e542b7467",
          typeName: "Retained Earnings",
          accountElementId: reserves.id,
          description:
            "Cumulative profits or losses not distributed to shareholders",
        },
        {
          id: "f1ee9996-005d-4b7d-804d-9c61437f9f82",
          typeName: "Other Comprehensive Income (OCI)",
          accountElementId: otherEquity.id,
          description: "Accumulated Other Comprehensive Income",
        },
        {
          id: "230cef7a-ed92-4eef-b76b-2b7cbfa43d6c",
          typeName: "Other Components of Equity",
          accountElementId: otherEquity.id,
          description: "All other components of equity including OCI",
        },
      ],
    });

    const incomeTypes = await prisma.accountType.createMany({
      data: [
        {
          id: "16527f50-d94a-4fb5-bdfb-86ad51ebaa7e",
          typeName: "Income",
          accountElementId: revenue.id,
          description:
            "Income from primary business activities, including sales and services",
        },
        {
          id: "89028f2e-2935-4d6f-add6-bed5354d2f50",
          typeName: "Contra-Revenue",
          accountElementId: contraRevenue.id,
          description: "Reductions in price offered to customers on sales",
        },
        {
          id: "3901ec6d-91b5-449b-8805-e71526dd8450",
          typeName: "Finance Income",
          accountElementId: otherIncome.id,
          description:
            "Income from sources outside primary business activities",
        },
        {
          id: "6760059c-be41-4d66-bb1d-d1cb5994588b",
          typeName: "Non-operating Income",
          accountElementId: otherIncome.id,
          description:
            "Income from sources outside primary business activities",
        },
      ],
    });

    const expenseTypes = await prisma.accountType.createMany({
      data: [
        {
          id: "605362fc-58e5-436d-805e-008d6313f4bb",
          typeName: "Cost of Sales",
          accountElementId: costOfSales.id,
          description:
            "Direct costs incurred in the production or acquisition of goods sold",
        },
        {
          id: "a1a658a0-7b31-4f2b-b5d0-978da055763c",
          typeName: "Employee Benefits",
          accountElementId: opex.id,
          description: "Wages, salaries, and benefits paid to employees",
        },
        {
          id: "23b862cb-00cd-463b-8efb-b1e68ee3c3fa",
          typeName: "Marketing and Advertising",
          accountElementId: opex.id,
          description:
            "Costs associated with promoting the company's products or services",
        },
        {
          id: "9458fa43-3c15-4e63-918d-8c54ad1b3fcd",
          typeName: "Rent, Insurance and Utilities",
          accountElementId: opex.id,
          description:
            "Expenses for rent, insurance, and utilities used for business operations",
        },
        {
          id: "7b683e39-579b-475f-bed6-0313735b8082",
          typeName: "Repairs and Maintenance",
          accountElementId: opex.id,
          description:
            "Costs for maintaining and repairing company-owned assets",
        },
        {
          id: "27d0095c-b6d9-436e-889e-28a336a60227",
          typeName: "Professional Fees",
          accountElementId: opex.id,
          description:
            "Fees paid to external professionals, such as lawyers and consultants",
        },
        {
          id: "9a03e2e3-9b78-4cc7-ba42-54125ea61d3b",
          typeName: "Telephone, Internet and Software Expenses",
          accountElementId: opex.id,
          description:
            "Costs for telecommunications, internet services, and software used in business operations",
        },
        {
          id: "9261acd9-ab25-4804-bc89-7581223b1fb8",
          typeName: "Transport and Travel",
          accountElementId: opex.id,
          description:
            "Expenses related to employee transportation and business travel",
        },
        {
          id: "79170de2-df5f-4ef3-ab13-9260e0d5fe0d",
          typeName: "Depreciation and Amortisation",
          accountElementId: opex.id,
          description:
            "The allocation of the cost of tangible and intangible assets over their useful life",
        },
        {
          id: "dfd8c5bb-3b03-4466-88c7-c4075c419d86",
          typeName: "Other General and Administrative Expenses",
          accountElementId: opex.id,
          description:
            "Miscellaneous expenses related to the general running of the business",
        },
        {
          id: "3a2a0a25-cd2c-4b9b-baf2-b3a46d78c2be",
          typeName: "Finance Costs",
          accountElementId: nonOpex.id,
          description:
            "Costs incurred from borrowing funds, including interest and other charges",
        },
        {
          id: "cfcd5b51-348b-4b92-8045-dc6485bca69e",
          typeName: "Non-Operating Expenses",
          accountElementId: nonOpex.id,
          description: "Expenses not related to core business operations",
        },
        {
          id: "26d7dc5c-e1f7-4159-8786-dac74a0f20d1",
          typeName: "Tax Expense",
          accountElementId: nonOpex.id,
          description: "Income taxes payable by the company on its earnings",
        },
      ],
    });
  };

  await seedAccountTypes();

  await seedDefaultCOAFromCSV();

  const seedBanks = async () => {
    for (const bank of bankData) {
      await prisma.bank.create({
        data: {
          id: bank.id,
          name: bank.name,
          bankLogo: `${baseUrl}${bank.bankLogo}`,
          countryId: "95856306-32e6-4edc-9374-49000b2660bd",
        },
      });
    }
  };

  await seedBanks();

  try {
    await seedExchangeRates();
  } catch (error) {
    console.error("Failed to seed exchange rates:", error);
  }

  const testCompany = await createACompany({
    id: "b5012c0b-bfca-4cec-8fca-c56369d1ccb4",
    name: "Demo Company",
    shortCode: "XwFbx1hT",
    countryId: "95856306-32e6-4edc-9374-49000b2660bd",
    reportingCurrencyId: "1d6a1e31-7e36-4eab-94e1-42f2173ea972",
    createdById: adminUser.id,
  });

  if (testCompany.success && testCompany.company) {
    await prisma.userCompany.create({
      data: {
        user: { connect: { id: adminUser.id } },
        company: { connect: { id: testCompany.company.id } },
        role: "ADMIN",
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

  const bankAccountData = [
    {
      id: "a4fe60b3-1d59-42ce-8081-3e5545579b9c",
      bankId: "499dda6d-865c-4be7-a3a3-c486ad3868e9",
      displayName: "Demo Salary Acc *6789",
      bankAccountType: "CHECKINGS_CURRENT",
      bankAccountNo: "0123456789",
      currencyId: "1d6a1e31-7e36-4eab-94e1-42f2173ea972",
      companyId: "b5012c0b-bfca-4cec-8fca-c56369d1ccb4",
    },
    {
      id: "81d56dde-3903-4b83-b492-08ae922c2d58",
      bankId: "1c620e90-e2bb-44fb-8d2a-d58751a0b966",
      displayName: "Demo Ops Acc *0011",
      bankAccountType: "CHECKINGS_CURRENT",
      bankAccountNo: "0123450011",
      currencyId: "1d6a1e31-7e36-4eab-94e1-42f2173ea972",
      companyId: "b5012c0b-bfca-4cec-8fca-c56369d1ccb4",
    },
    {
      id: "9ce95e76-4b8c-474a-9ee0-df2581a7ac2c",
      bankId: "499dda6d-865c-4be7-a3a3-c486ad3868e9",
      displayName: "Demo USD Acc *0000",
      bankAccountType: "CHECKINGS_CURRENT",
      bankAccountNo: "1123450000",
      currencyId: "f3a1b0b1-c658-4af8-b5d0-b93467829a4d",
      companyId: "b5012c0b-bfca-4cec-8fca-c56369d1ccb4",
    },
  ];

  const newBankAccounts = async () => {
    try {
      const accounts = await Promise.all(
        bankAccountData.map((tx) =>
          createNewBankAccount(tx.companyId, tx as CreateBankData)
        )
      );
      return accounts;
    } catch (error) {
      console.error("Error creating bank accounts:", error);
      throw error;
    }
  };

  await newBankAccounts();
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
