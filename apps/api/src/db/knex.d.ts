import type { Knex } from 'knex';
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
} from '../core/types/db.types.ts';
import { CoaTemplate, NewCoaTemplateInput } from '../domains/chartOfAccounts/coaTemplate.type.ts';
import { NewUserDirect, NewUserInput, User } from '../domains/users/users.types.ts';
import { Company, NewCompany } from '../domains/companies/companies.types.ts';
import { Coa, NewCoa } from '../domains/chartOfAccounts/coa.types.ts';
import { AccFirm, NewAccFirm } from '../domains/accountingFirms/firms.types.ts';
import { NewUserCompanyRole, UserCompanyRole } from '../domains/userRoles/userRoles.types.ts';
import { BankAccount, NewBankAccount } from '../domains/banking/bankAccounts/bankAccounts.types.ts';
import { ExchangeRate, NewExchangeRateInput } from '../domains/exchangeRates/exchangeRate.types.ts';
import { Bank, NewBank } from '../domains/banking/banks/banks.types.ts';
import {
  BankTransaction,
  BankTransactionBatches,
  NewBankTransaction,
  NewBankTransactionBatches,
} from '../domains/bankTransactions/bankTransactions.types.ts';
import {
  BankFeedProvider,
  BankFeedProviderCountries,
  NewBankFeedProvider,
  NewBankFeedProviderCountry,
} from '../domains/bankFeedProviders/bankFeedProviders.types.ts';
import {
  BankProviderMapping,
  NewBankProviderMapping,
} from '../domains/banking/bankProviderMappings/bankProviderMappings.types.ts';
import { NewToken, Token } from '../domains/tokens/tokens.types.ts';
import { NewRoleInput, Role } from '../domains/roles/roles.types.ts';
import { Contact, NewContact } from '../domains/contacts/contact.types.ts';
import { NewProject, Project } from '../domains/projects/projects.types.ts';
import type {
  BankAccountCredential,
  NewBankAccountCredential,
} from '../domains/banking/bankAccountCredentials/bankAccountCredentials.types.ts';

declare module 'knex/types/tables' {
  interface Tables {
    roles: Knex.CompositeTableType<Role, NewRoleInput, Partial<Omit<Role, 'id'>>>;

    permissions: Knex.CompositeTableType<
      Permission,
      NewPermissionInput,
      Partial<Omit<Permission, 'id'>>
    >;

    currencies: Knex.CompositeTableType<Currency, NewCurrencyInput, Partial<Omit<Currency, 'id'>>>;

    countries: Knex.CompositeTableType<Country, NewCountryInput, Partial<Omit<Country, 'id'>>>;

    exchange_rate: Knex.CompositeTableType<
      ExchangeRate,
      NewExchangeRateInput,
      Partial<Omit<ExchangeRate, 'id'>>
    >;

    financial_statements: Knex.CompositeTableType<
      FinancialStatement,
      NewFinancialStatementInput,
      Partial<Omit<FinancialStatement, 'id'>>
    >;

    account_elements: Knex.CompositeTableType<
      AccountElement,
      NewAccountElementInput,
      Partial<Omit<AccountElement, 'id'>>
    >;

    account_types: Knex.CompositeTableType<
      AccountType,
      NewAccountTypeInput,
      Partial<Omit<AccountType, 'id'>>
    >;

    coa_templates: Knex.CompositeTableType<
      CoaTemplate,
      NewCoaTemplateInput,
      Partial<Omit<CoaTemplate, 'id'>>
    >;

    users: Knex.CompositeTableType<User, NewUserDirect | NewUserInput, Partial<Omit<User, 'id'>>>;

    tokens: Knex.CompositeTableType<Token, NewToken, Partial<Omit<Token, 'id'>>>;

    companies: Knex.CompositeTableType<Company, NewCompany, Partial<Omit<Company, 'id'>>>;

    accounting_firms_meta: Knex.CompositeTableType<
      AccFirm,
      NewAccFirm,
      Partial<Omit<AccFirm, 'id'>>
    >;

    user_company_roles: Knex.CompositeTableType<
      UserCompanyRole,
      NewUserCompanyRole,
      Partial<Omit<UserCompanyRole, 'id'>>
    >;

    client_firm_assignments: Knex.CompositeTableType<
      ClientFirmAssignments,
      NewClientFirmAssignments,
      Partial<Omit<ClientFirmAssignments, 'id'>>
    >;

    firm_user_client_assignments: Knex.CompositeTableType<Fuca, NewFuca, Partial<Omit<Fuca, 'id'>>>;

    roles_permissions: Knex.CompositeTableType<
      RolePermission,
      RolePermission,
      Partial<RolePermission>
    >;

    coa: Knex.CompositeTableType<Coa, NewCoa, Partial<Omit<Coa, 'id'>>>;

    banks: Knex.CompositeTableType<Bank, NewBank, Partial<Omit<Bank, 'id'>>>;

    bank_accounts: Knex.CompositeTableType<
      BankAccount,
      NewBankAccount,
      Partial<Omit<BankAccount, 'id'>>
    >;

    bank_account_credentials: Knex.CompositeTableType<
      BankAccountCredential,
      NewBankAccountCredential,
      Partial<Omit<BankAccountCredential, 'id'>>
    >;

    bank_transactions: Knex.CompositeTableType<
      BankTransaction,
      NewBankTransaction,
      Partial<Omit<BankTransaction, 'id'>>
    >;

    bank_transaction_batches: Knex.CompositeTableType<
      BankTransactionBatches,
      NewBankTransactionBatches,
      Partial<Omit<BankTransactionBatches, 'id'>>
    >;

    bank_feed_providers: Knex.CompositeTableType<
      BankFeedProvider,
      NewBankFeedProvider,
      Partial<Omit<BankFeedProvider, 'id'>>
    >;

    bank_feed_provider_countries: Knex.CompositeTableType<
      BankFeedProviderCountries,
      NewBankFeedProviderCountry,
      Partial<Omit<BankFeedProviderCountries, 'id'>>
    >;

    bank_provider_mappings: Knex.CompositeTableType<
      BankProviderMapping,
      NewBankProviderMapping,
      Partial<Omit<BankProviderMapping, 'id'>>
    >;

    contacts: Knex.CompositeTableType<Contact, NewContact, Partial<Omit<Contact, 'id'>>>;

    projects: Knex.CompositeTableType<Project, NewProject, Partial<Omit<Project, 'id'>>>;
  }
}
