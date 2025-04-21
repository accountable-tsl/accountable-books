import { Knex } from "knex";
import {
  AccountElement,
  AccountType,
  Country,
  Currency,
  ExchangeRate,
  FinancialStatement,
  NewAccountElementInput,
  NewAccountTypeInput,
  NewCountryInput,
  NewCurrencyInput,
  NewExchangeRateInput,
  NewFinancialStatementInput,
  NewPermissionInput,
  NewRoleInput,
  NewUserCompanyRole,
  Permission,
  Role,
  UserCompanyRole,
} from "./db.type";
import {
  CoaTemplate,
  NewCoaTemplateInput,
} from "../../domains/chartOfAccounts/coaTemplate.type";
import {
  NewUserDirect,
  NewUserInput,
  User,
} from "../../domains/user/user.types";
import { Company, NewCompany } from "../../domains/company/company.types";
import { Coa, NewCoa } from "../../domains/chartOfAccounts/coa.types";
import {
  AccFirm,
  NewAccFirm,
} from "../../domains/accountingFirm/accountingFirm.types";

declare module "knex/types/tables" {
  interface Tables {
    role: Knex.CompositeTableType<
      Role,
      NewRoleInput,
      Partial<Omit<Role, "id">>
    >;

    permission: Knex.CompositeTableType<
      Permission,
      NewPermissionInput,
      Partial<Omit<Permission, "id">>
    >;

    currency: Knex.CompositeTableType<
      Currency,
      NewCurrencyInput,
      Partial<Omit<Currency, "id">>
    >;

    country: Knex.CompositeTableType<
      Country,
      NewCountryInput,
      Partial<Omit<Country, "id">>
    >;

    exchange_rate: Knex.CompositeTableType<
      ExchangeRate,
      NewExchangeRateInput,
      Partial<Omit<ExchangeRate, "id">>
    >;

    financial_statement: Knex.CompositeTableType<
      FinancialStatement,
      NewFinancialStatementInput,
      Partial<Omit<FinancialStatement, "id">>
    >;

    account_element: Knex.CompositeTableType<
      AccountElement,
      NewAccountElementInput,
      Partial<Omit<AccountElement, "id">>
    >;

    account_type: Knex.CompositeTableType<
      AccountType,
      NewAccountTypeInput,
      Partial<Omit<AccountType, "id">>
    >;

    coa_template: Knex.CompositeTableType<
      CoaTemplate,
      NewCoaTemplateInput,
      Partial<Omit<CoaTemplate, "id">>
    >;

    user: Knex.CompositeTableType<
      User,
      NewUserDirect | NewUserInput,
      Partial<Omit<User, "id">>
    >;

    company: Knex.CompositeTableType<
      Company,
      NewCompany,
      Partial<Omit<Company, "id">>
    >;

    accounting_firm: Knex.CompositeTableType<
      AccFirm,
      NewAccFirm,
      Partial<Omit<AccFirm, "id">>
    >;

    user_company_role: Knex.CompositeTableType<
      UserCompanyRole,
      NewUserCompanyRole,
      Partial<Omit<UserCompanyRole, "id">>
    >;

    coa: Knex.CompositeTableType<Coa, NewCoa, Partial<Omit<Coa, "id">>>;
  }

}
