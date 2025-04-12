import { Knex } from "knex";
import {
  AccountElement,
  AccountingFirm,
  AccountType,
  CoaTemplate,
  Company,
  Country,
  Currency,
  ExchangeRate,
  FinancialStatement,
  NewAccountElementInput,
  NewAccountTypeInput,
  NewCoaTemplateInput,
  NewCompany,
  NewCountryInput,
  NewCurrencyInput,
  NewExchangeRateInput,
  NewFinancialStatementInput,
  NewPermissionInput,
  NewRoleInput,
  NewUserCompanyRole,
  Permission,
  Role,
  User,
  UserCompanyRole,
} from "./db.type";

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

    user: User;

    company: Knex.CompositeTableType<
      Company,
      NewCompany,
      Partial<Omit<Company, "id">>
    >;

    accounting_firm: AccountingFirm;

    user_company_role: Knex.CompositeTableType<
      UserCompanyRole,
      NewUserCompanyRole,
      Partial<Omit<UserCompanyRole, "id">>
    >;
  }
}
