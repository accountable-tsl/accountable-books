import {
  company,
  CompanyType,
  companyType,
} from "../../../src/domains/companies/companies.types";
import { getCountry } from "../../../src/domains/countries/countries.utils";
import { getCurrency } from "../../../src/domains/currencies/currencies.utils";
import {
  createCompleteCompanyOnboardingState,
  createCompleteUserOnboardingState,
} from "../../../src/features/onboarding/onboarding.utils";
import {
  CreateDemoBase,
  CreateDemoInput,
  DemoSeedArgs,
  DemoSeedConfig,
} from "./types";

function createDemoConfig({
  firstname,
  lastname,
  email,
  companyName,
  companyType,
  shortCode,
  slug,
  args,
}: CreateDemoInput): DemoSeedConfig {
  const { reportingCurrency, homeCountry } = args;

  return {
    user: {
      firstname,
      lastname,
      email: email.trim().toLowerCase(),
      password: "StrongDemoPass!", // consistent across demo
      isDemoUser: true,
      emailVerifiedAt: new Date(),
      onboardingState: createCompleteUserOnboardingState(),
    },
    company: {
      legalName: companyName,
      type: companyType,
      reportingCurrencyId: reportingCurrency.id,
      countryId: homeCountry.id,
      yearEndDay: 31,
      yearEndMonth: 12,
      isDemoCompany: true,
      shortCode,
      ...(companyType === "accounting_firm" && slug ? { slug } : {}),
      onboardingState: createCompleteCompanyOnboardingState(companyType),
    },
  };
}

const demoFirmInput: CreateDemoBase = {
  firstname: "Demi",
  lastname: "Smith",
  email: "demo.firm@example.com",
  companyName: "Demo Firm",
  companyType: companyType.enum.accounting_firm,
  shortCode: "firmDemo",
  slug: "demo",
};

const demoBusinessInput: CreateDemoBase = {
  firstname: "Diane",
  lastname: "Brown",
  email: "demo.business@example.com",
  companyName: "Demo Biz Ltd",
  companyType: companyType.enum.business,
  shortCode: "bizDemo",
};

const demoIndividualInput: CreateDemoBase = {
  firstname: "Ronke",
  lastname: "Doe",
  email: "demo.individual@example.com",
  companyName: "Ronke's Finances",
  companyType: companyType.enum.individual,
  shortCode: "indDemo",
};

export const createDemoSeedConfig = async () => {
  const NGN = await getCurrency("NGN");
  const USD = await getCurrency("USD");
  const GHS = await getCurrency("GHS");
  const GBP = await getCurrency("GBP");
  const EUR = await getCurrency("EUR");

  const nigeria = await getCountry("NG");
  const usa = await getCountry("US");

  const args: DemoSeedArgs = {
    reportingCurrency: NGN,
    homeCountry: nigeria,
  };

  return [
    createDemoConfig({ ...demoFirmInput, args }),
    createDemoConfig({ ...demoBusinessInput, args }),
    createDemoConfig({ ...demoIndividualInput, args }),
  ];
};
export const demoSeedConfig = await createDemoSeedConfig();
