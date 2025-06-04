import { faker } from "@faker-js/faker";
import {
  CompanyType,
  NewCompanyInputCamel,
} from "../../src/domains/companies/companies.types";
import { NewUserInputCamel } from "../../src/domains/users/users.types";
import knexClient from "../../knexClient";
import { registerNewAccount } from "../../src/features/signup/signup.service";

const generateDemoSignupInput = (input: {
  companyType: CompanyType;
  userId?: string;
  companyId?: string;
  companyName?: string;
  currencyId?: string;
  countryId?: string;
  yearEndDay?: number;
  yearEndMonth?: number;
}): {
  user: NewUserInputCamel;
  company: NewCompanyInputCamel;
} => {
  const {
    companyType,
    userId,
    companyId,
    companyName,
    currencyId,
    countryId,
    yearEndDay,
    yearEndMonth,
  } = input;

  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const slugs = ["firm", "zrxl", "beta", "alpha", "lambda"];
  return {
    user: {
      firstname: firstName,
      lastname: lastName,
      email: `demo.${companyType === "accounting_firm" ? "firm" : companyType}@example.com`,
      password: "StrongDemoPass!",
      avatarUrl: faker.image.avatar(),
      isDemoUser: true,
      ...(userId && { id: userId }),
    },
    company: {
      legalName: companyName || faker.company.name(),
      type: companyType,
      countryId: countryId || "5a60ff99-bd7e-400e-84a6-ebb131789322", // US
      reportingCurrencyId: currencyId || "f3a1b0b1-c658-4af8-b5d0-b93467829a4d", // USD
      ...(yearEndDay ? { yearEndDay } : {}),
      ...(yearEndMonth ? { yearEndMonth } : {}),
      ...(companyType === "accounting_firm"
        ? {
            slug: slugs[Math.floor(Math.random() * slugs.length)],
          }
        : {}),
      isDemoCompany: true,
      ...(companyId && { id: companyId }),
    },
  };
};

export const createSeedCompanyAndUser = async (input: {
  companyType: CompanyType;
  userId?: string;
  companyId?: string;
  companyName?: string;
  currencyId?: string;
  countryId?: string;
  yearEndDay?: number;
  yearEndMonth?: number;
}) => {
  const {
    companyType,
    userId,
    companyId,
    companyName,
    currencyId,
    countryId,
    yearEndDay,
    yearEndMonth,
  } = input;

  const { user, company } = generateDemoSignupInput({
    companyType,
    userId,
    companyId,
    companyName,
    currencyId,
    countryId,
    yearEndDay,
    yearEndMonth,
  });

  const existingUser = await knexClient("users")
    .select("id")
    .where({ email: user.email })
    .first();

  let existingCompany = null;
  if (companyName) {
    existingCompany = await knexClient("companies")
      .select("id")
      .where({ legal_name: companyName })
      .first();
  }

  if (existingUser || existingCompany) {
    console.log(`User or company already exists. Skipping insert.`);
    return null;
  }

  const result = await registerNewAccount(knexClient, { user, company });

  if (!result.success) {
    console.log(result);
    console.error("❌ Failed to create demo user/company:", result.message);
    return null;
  }

  return result.data;
};
