import {
  CompanyType,
  NewCompanyInputCamel,
} from "../../../src/domains/companies/companies.types";
import { ContactInput } from "../../../src/domains/contacts/contact.types";
import { CountryRes } from "../../../src/domains/countries/countries.types";
import { CurrencyRes } from "../../../src/domains/currencies/currencies.types";
import { NewProjectInput } from "../../../src/domains/projects/projects.types";
import { NewUserInputCamel } from "../../../src/domains/users/users.types";

export type CreateDemoBase = {
  firstname: string;
  lastname?: string;
  email: string;
  companyName: string;
  companyType: CompanyType;
  shortCode?: string;
  slug?: string;
};

export type CreateDemoInput = CreateDemoBase & {
  args: DemoSeedArgs;
};

export type DemoSeedArgs = {
  reportingCurrency: CurrencyRes;
  homeCountry: CountryRes;
};

export type DemoSeedConfig = {
  user: NewUserInputCamel;
  company: NewCompanyInputCamel;
  contacts: ContactInput[];
  genProjects: (contactIds: string[]) => NewProjectInput[];
};
