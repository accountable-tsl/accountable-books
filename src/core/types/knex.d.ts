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
  Permission,
  Role,
  RolePermission,
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
import { Company, NewCompany } from "../../domains/companies/companies.types";
import { Coa, NewCoa } from "../../domains/chartOfAccounts/coa.types";
import {
  AccFirm,
  NewAccFirm,
} from "../../domains/accountingFirm/accountingFirm.types";
import {
  NewUserCompanyRole,
  UserCompanyRole,
} from "../../domains/userCompanyRole/userCompanyRole.types";

declare module "knex/types/tables" {
  interface Tables {
    roles: Knex.CompositeTableType<
      Role,
      NewRoleInput,
      Partial<Omit<Role, "id">>
    >;

    permissions: Knex.CompositeTableType<
      Permission,
      NewPermissionInput,
      Partial<Omit<Permission, "id">>
    >;

    currencies: Knex.CompositeTableType<
      Currency,
      NewCurrencyInput,
      Partial<Omit<Currency, "id">>
    >;

    countries: Knex.CompositeTableType<
      Country,
      NewCountryInput,
      Partial<Omit<Country, "id">>
    >;

    exchange_rate: Knex.CompositeTableType<
      ExchangeRate,
      NewExchangeRateInput,
      Partial<Omit<ExchangeRate, "id">>
    >;

    financial_statements: Knex.CompositeTableType<
      FinancialStatement,
      NewFinancialStatementInput,
      Partial<Omit<FinancialStatement, "id">>
    >;

    account_elements: Knex.CompositeTableType<
      AccountElement,
      NewAccountElementInput,
      Partial<Omit<AccountElement, "id">>
    >;

    account_types: Knex.CompositeTableType<
      AccountType,
      NewAccountTypeInput,
      Partial<Omit<AccountType, "id">>
    >;

    coa_templates: Knex.CompositeTableType<
      CoaTemplate,
      NewCoaTemplateInput,
      Partial<Omit<CoaTemplate, "id">>
    >;

    users: Knex.CompositeTableType<
      User,
      NewUserDirect | NewUserInput,
      Partial<Omit<User, "id">>
    >;

    companies: Knex.CompositeTableType<
      Company,
      NewCompany,
      Partial<Omit<Company, "id">>
    >;

    accounting_firms: Knex.CompositeTableType<
      AccFirm,
      NewAccFirm,
      Partial<Omit<AccFirm, "id">>
    >;

    users_companies_roles: Knex.CompositeTableType<
      UserCompanyRole,
      NewUserCompanyRole,
      Partial<Omit<UserCompanyRole, "id">>
    >;

    coa: Knex.CompositeTableType<Coa, NewCoa, Partial<Omit<Coa, "id">>>;

    roles_permissions: Knex.CompositeTableType<
      RolePermission,
      RolePermission,
      Partial<RolePermission>
    >;
  }
}
