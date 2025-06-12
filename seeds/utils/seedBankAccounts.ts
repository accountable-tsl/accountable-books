import { faker } from "@faker-js/faker";
import knexClient from "../../knexClient";
import { createNewBankAccount } from "../../src/domains/bankAccounts/bankAccounts.model";
import {
  bankAccountType,
  NewBankAccountInput,
} from "../../src/domains/bankAccounts/bankAccounts.types";
import { getCompanies } from "../../src/domains/companies/companies.model";
import { CompanyType } from "../../src/domains/companies/companies.types";
import {
  CoaSource,
  coaSource,
} from "../../src/domains/chartOfAccounts/coa.types";
import {
  banksInSystem,
  countriesInSystem,
  currenciesInSystem,
} from "../data/shared";
import { all } from "axios";

export const seedBankAccounts = async (bankAccountCreationData: {
  companyType: CompanyType;
  company?: any;
  userId?: string;
  data?: NewBankAccountInput[];
}) => {
  const {
    companyType,
    company: companyInput,
    userId: userIdInput,
    data,
  } = bankAccountCreationData;

  let company = companyInput;
  let userId = userIdInput || "";

  if (
    !companyInput ||
    !companyInput.reportingCurrencyId ||
    !companyInput.id ||
    !companyInput.countryId
  ) {
    // Get all demo companies
    const demoCompanies = await getCompanies({
      filters: {
        isDemoCompany: true,
      },
    });

    if (
      !demoCompanies.success ||
      !demoCompanies.data ||
      demoCompanies.data?.length === 0
    ) {
      throw new Error("No demo companies found");
    }

    const demoCompany = demoCompanies.data.find(
      (company) => company.companyType === companyType
    );

    if (!demoCompany) {
      throw new Error("No demo company found");
    }
    //  id = demoCompany.reportingCurrencyId
    company = demoCompany;
    userId = demoCompany.createdById;
  }

  if (!userId) {
    throw new Error("No user id found");
  }

  const companyId = company.id;
  const reportingCurrencyId = company.reportingCurrencyId;
  const countryId = company.countryId;

  const bankData =
    data ||
    generateDemoBankAccounts({
      currency: reportingCurrencyId,
      country: countryId,
      companyType,
    });

  // console.log(bankData);
  if (!bankData || bankData.length === 0) {
    throw new Error("No bank account data to process");
  }

  return await knexClient.transaction(async (trx) => {
    const results = await Promise.all(
      bankData.map(async (bank) => {
        const result = await createNewBankAccount({
          companyId,
          userId,
          data: bank,
        });

        // Check if individual creation failed
        if (!result.success) {
          throw new Error(`Failed to create bank account: ${result.message}`);
        }

        return result;
      })
    );

    return {
      success: true,
      message: "Seed bank accounts created successfully",
      data: results,
    };
  });
};

export const generateDemoBankAccounts = ({
  currency,
  country,
  companyType,
}: {
  currency: string;
  country: string;
  companyType: CompanyType;
}): NewBankAccountInput[] => {
  // Generate two local bank accounts (in their company reporting currency)
  // One in a currency that's not their company reporting currency
  // One account in a different country
  // Random: Any currency, any country

  const resolvedCurrency = resolveCurrency(currency);
  const resolvedCountry = resolveCountry(country);

  if (!resolvedCurrency) throw new Error(`Currency not found: ${currency}`);
  if (!resolvedCountry) throw new Error(`Country not found: ${country}`);

  const namePool =
    companyType === "individual"
      ? [
          "Personal Account",
          "Savings",
          "Emergency Fund",
          "Salary Account",
          "Bills Account",
          "Rent Account",
          "Groceries",
          "Travel Fund",
          "Investment Account",
          "Daily Spending",
        ]
      : [
          "Main Account",
          "Operating Account",
          "Reserve Fund",
          "Online Sales",
          "Marketing Budget",
          "Salary Account",
          "Tax Reserve",
          "Fixed Deposit Account",
          "Stripe Clearing",
          "PayPal Balance",
          "VAT Holding Account",
          "Credit Card Repayment",
          "Loan Disbursement Account",
          "Amazon Payouts",
          "Facebook Ads Wallet",
          "Google Ads Wallet",
          "Temporary Holding Account",
        ];
  if (namePool.length < 5)
    throw new Error("Name pool must have at least 5 entries");

  // Shuffle and pick 5 unique names
  const shuffledNames = faker.helpers.shuffle(namePool).slice(0, 5);

  const ALLOWED_DEMO_COUNTRY_CODES = ["US", "NG", "GB", "FR", "DE"];
  // Filter all countries and banks to only allowed demo countries
  const allowedCountries = countriesInSystem.filter((c) =>
    ALLOWED_DEMO_COUNTRY_CODES.includes(c.code)
  );
  const allowedCountryIds = new Set(allowedCountries.map((c) => c.id));

  // Local banks in user's country
  // Only allowed local banks
  const localBanks = banksInSystem.filter(
    (b) =>
      b.country_id === resolvedCountry.id && allowedCountryIds.has(b.country_id)
  );

  if (localBanks.length === 0)
    throw new Error(`No banks found for country: ${resolvedCountry.name}`);

  // Other allowed countries (excluding the input one)
  const otherCountries = allowedCountries.filter(
    (c) => c.id !== resolvedCountry.id
  );
  if (otherCountries.length === 0)
    throw new Error(`No other countries available`);

  // All other currencies
  const otherCurrencies = allowedCurrencies.filter(
    (c) => c.id !== resolvedCurrency.id
  );
  if (otherCurrencies.length === 0)
    throw new Error(`No other currencies available`);

  // --- 1. Two local accounts in company reporting currency ---
  const localBank1 = faker.helpers.arrayElement(localBanks);
  const filteredLocalBanks =
    localBanks.length > 1
      ? localBanks.filter((b) => b.id !== localBank1.id)
      : localBanks;
  const localBank2 = faker.helpers.arrayElement(filteredLocalBanks);

  const localAccounts: NewBankAccountInput[] = [
    {
      displayName: shuffledNames[0],
      accountType: faker.helpers.arrayElement(bankAccountType.options),
      accountNumber: faker.finance.accountNumber(10),
      bankId: localBank1.id,
      currencyId: resolvedCurrency.id,
      source: coaSource.enum.system,
    },
    {
      displayName: shuffledNames[1],
      accountType: faker.helpers.arrayElement(bankAccountType.options),
      accountNumber: faker.finance.accountNumber(10),
      bankId: localBank2.id,
      currencyId: resolvedCurrency.id,
      source: coaSource.enum.system,
    },
  ];

  // --- 2. One local account in a different currency ---
  const otherCurrency = faker.helpers.arrayElement(otherCurrencies);
  const localOtherCurrencyAccount: NewBankAccountInput = {
    displayName: shuffledNames[2],
    accountType: faker.helpers.arrayElement(bankAccountType.options),
    accountNumber: faker.finance.accountNumber(10),
    bankId: faker.helpers.arrayElement(localBanks).id,
    currencyId: otherCurrency.id,
    source: coaSource.enum.system,
  };

  // All allowed banks
  const allowedBanksInSystem = banksInSystem.filter((b) =>
    allowedCountryIds.has(b.country_id)
  );
  if (allowedBanksInSystem.length === 0)
    throw new Error(`No allowed banks in system`);

  // --- 3. One account in a different country (any currency) ---
  // When selecting random bank or foreign bank, use allowedBanksInSystem
  // For foreign account:
  const foreignCountry = faker.helpers.arrayElement(otherCountries);
  const foreignBanks = allowedBanksInSystem.filter(
    (b) => b.country_id === foreignCountry.id
  );
  if (foreignBanks.length === 0)
    throw new Error(
      `No banks found for foreign country: ${foreignCountry.name}`
    );
  const foreignBank = faker.helpers.arrayElement(foreignBanks);
  const foreignCurrency = faker.helpers.arrayElement(allowedCurrencies);

  const foreignAccount: NewBankAccountInput = {
    displayName: shuffledNames[3],
    accountType: faker.helpers.arrayElement(bankAccountType.options),
    accountNumber: faker.finance.accountNumber(10),
    bankId: foreignBank.id,
    currencyId: foreignCurrency.id,
    source: coaSource.enum.system,
  };

  const randomBank = faker.helpers.arrayElement(allowedBanksInSystem);
  const randomCurrency = faker.helpers.arrayElement(allowedCurrencies);

  const randomAccount: NewBankAccountInput = {
    displayName: shuffledNames[4],
    accountType: faker.helpers.arrayElement(bankAccountType.options),
    accountNumber: faker.finance.accountNumber(10),
    bankId: randomBank.id,
    currencyId: randomCurrency.id,
    source: coaSource.enum.system,
  };

  // --- Return all 5 accounts ---
  return [
    ...localAccounts,
    localOtherCurrencyAccount,
    foreignAccount,
    randomAccount,
  ];
};

const ALLOWED_DEMO_CURRENCY_CODES = ["NGN", "GHS", "USD", "GBP", "EUR"];
const allowedCurrencies = currenciesInSystem.filter((c) =>
  ALLOWED_DEMO_CURRENCY_CODES.includes(c.code)
);

export function resolveCurrency(codeOrId: string) {
  return allowedCurrencies.find(
    (c) => c.id === codeOrId || c.code === codeOrId
  );
}

export function resolveCountry(codeOrId: string) {
  return countriesInSystem.find(
    (c) => c.id === codeOrId || c.code === codeOrId
  );
}
