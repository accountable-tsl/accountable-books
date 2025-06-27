import { Knex } from "knex";
import {
  AccountElement,
  AccountType,
  ClientFirmAssignments,
  Country,
  Currency,
  FinancialStatement,
  Fuca,
  NewAccountElementInput,
  NewAccountTypeInput,
  NewClientFirmAssignments,
  NewCountryInput,
  NewCurrencyInput,
  NewFinancialStatementInput,
  NewFuca,
  NewPermissionInput,
  Permission,
  RolePermission,
} from "./db.types";
import {
  CoaTemplate,
  NewCoaTemplateInput,
} from "../../domains/chartOfAccounts/coaTemplate.type";
import {
  NewUserDirect,
  NewUserInput,
  User,
} from "../../domains/users/users.types";
import { Company, NewCompany } from "../../domains/companies/companies.types";
import { Coa, NewCoa } from "../../domains/chartOfAccounts/coa.types";
import { AccFirm, NewAccFirm } from "../../domains/accountingFirms/firms.types";
import {
  NewUserCompanyRole,
  UserCompanyRole,
} from "../../domains/userRoles/userRoles.types";
import {
  BankAccount,
  NewBankAccount,
} from "../../domains/bankAccounts/bankAccounts.types";
import {
  ExchangeRate,
  NewExchangeRateInput,
} from "../../domains/exchangeRates/exchangeRate.types";
import { Bank, NewBank } from "../../domains/banks/banks.types";
import {
  BankTransaction,
  BankTransactionBatches,
  NewBankTransaction,
  NewBankTransactionBatches,
} from "../../domains/bankTransactions/bankTransactions.types";
import {
  BankFeedProvider,
  BankFeedProviderCountries,
  NewBankFeedProvider,
  NewBankFeedProviderCountry,
} from "../../domains/bankFeedProviders/bankFeedProviders.types";
import {
  BankAccountConnection,
  NewBankAccountConnection,
} from "../../domains/bankAccountConnections/baccons.types";
import {
  BankProviderMapping,
  NewBankProviderMapping,
} from "../../domains/mapBankToProviderBank/bankProviderMappings.types";
import { NewToken, Token } from "../../domains/tokens/tokens.types";
import { NewRoleInput, Role } from "../../domains/roles/roles.types";

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

    tokens: Knex.CompositeTableType<
      Token,
      NewToken,
      Partial<Omit<Token, "id">>
    >;

    companies: Knex.CompositeTableType<
      Company,
      NewCompany,
      Partial<Omit<Company, "id">>
    >;

    accounting_firms_meta: Knex.CompositeTableType<
      AccFirm,
      NewAccFirm,
      Partial<Omit<AccFirm, "id">>
    >;

    user_company_roles: Knex.CompositeTableType<
      UserCompanyRole,
      NewUserCompanyRole,
      Partial<Omit<UserCompanyRole, "id">>
    >;

    client_firm_assignments: Knex.CompositeTableType<
      ClientFirmAssignments,
      NewClientFirmAssignments,
      Partial<Omit<ClientFirmAssignments, "id">>
    >;

    firm_user_client_assignments: Knex.CompositeTableType<
      Fuca,
      NewFuca,
      Partial<Omit<Fuca, "id">>
    >;

    roles_permissions: Knex.CompositeTableType<
      RolePermission,
      RolePermission,
      Partial<RolePermission>
    >;

    coa: Knex.CompositeTableType<Coa, NewCoa, Partial<Omit<Coa, "id">>>;

    banks: Knex.CompositeTableType<Bank, NewBank, Partial<Omit<Bank, "id">>>;

    bank_accounts: Knex.CompositeTableType<
      BankAccount,
      NewBankAccount,
      Partial<Omit<BankAccount, "id">>
    >;

    bank_transactions: Knex.CompositeTableType<
      BankTransaction,
      NewBankTransaction,
      Partial<Omit<BankTransaction, "id">>
    >;

    bank_transaction_batches: Knex.CompositeTableType<
      BankTransactionBatches,
      NewBankTransactionBatches,
      Partial<Omit<BankTransactionBatches, "id">>
    >;

    bank_feed_providers: Knex.CompositeTableType<
      BankFeedProvider,
      NewBankFeedProvider,
      Partial<Omit<BankFeedProvider, "id">>
    >;

    bank_feed_provider_countries: Knex.CompositeTableType<
      BankFeedProviderCountries,
      NewBankFeedProviderCountry,
      Partial<Omit<BankFeedProviderCountries, "id">>
    >;

    bank_provider_mappings: Knex.CompositeTableType<
      BankProviderMapping,
      NewBankProviderMapping,
      Partial<Omit<BankProviderMapping, "id">>
    >;

    bank_account_connections: Knex.CompositeTableType<
      BankAccountConnection,
      NewBankAccountConnection,
      Partial<Omit<BankAccountConnection, "id">>
    >;
  }
}
