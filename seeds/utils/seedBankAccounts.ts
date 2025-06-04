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

export const seedBankAccounts = async (bankAccountCreationData: {
  companyType: CompanyType;
  companyId?: string;
  userId?: string;
  data?: NewBankAccountInput[];
}) => {
  const {
    companyType,
    companyId,
    userId: userIdInput,
    data,
  } = bankAccountCreationData;

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

  const userId = userIdInput || demoCompany?.createdById;

  if (!userId) {
    throw new Error("No user id found");
  }

  const localBankAccount = generateFakeBankAccount({
    currency: demoCompany.reportingCurrencyCode,
    country: demoCompany.countryCode || "US",
  });

  const USDBankAccount = generateFakeBankAccount({
    currency: "USD",
    country: "US",
  });

  const EURBankAccount = generateFakeBankAccount({
    currency: "EUR",
    country: "DE",
  });

  const GBPBankAccount = generateFakeBankAccount({
    currency: "GBP",
    country: "GB",
  });

  const bankData = data || [
    localBankAccount,
    USDBankAccount,
    EURBankAccount,
    GBPBankAccount,
  ];

  return await knexClient.transaction(async (trx) => {
    const results = await Promise.all(
      bankData.map(async (bank) => {
        const result = await createNewBankAccount({
          companyId: demoCompany.id,
          userId,
          data: bank,
          trx,
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

export const generateFakeBankAccount = ({
  currency,
  country,
  source = coaSource.enum.system,
}: {
  currency: string;
  country: string;
  source?: CoaSource;
}): NewBankAccountInput => {
  const resolvedCurrency = resolveCurrency(currency);
  const resolvedCountry = resolveCountry(country);

  if (!resolvedCurrency) {
    throw new Error(`Currency not found: ${currency}`);
  }

  if (!resolvedCountry) {
    throw new Error(`Country not found: ${country}`);
  }

  const countryBanks = banksInSystem.filter(
    (b) => b.country_id === resolvedCountry.id
  );

  if (countryBanks.length === 0) {
    throw new Error(`No banks found for country: ${resolvedCountry.name}`);
  }

  const randomBank = faker.helpers.arrayElement(countryBanks);
  const randomAccountType = faker.helpers.arrayElement(bankAccountType.options);

  return {
    displayName: faker.finance.accountName(),
    accountNumber: faker.finance.accountNumber(10),
    // accountCode: `BA-${faker.string.alphanumeric(4).toUpperCase()}`,
    currencyId: resolvedCurrency.id,
    bankId: randomBank.id,
    accountType: randomAccountType,
    source,
  };
};

export function resolveCurrency(codeOrId: string) {
  return currenciesInSystem.find(
    (c) => c.id === codeOrId || c.code === codeOrId
  );
}

export function resolveCountry(codeOrId: string) {
  return countriesInSystem.find(
    (c) => c.id === codeOrId || c.code === codeOrId
  );
}
