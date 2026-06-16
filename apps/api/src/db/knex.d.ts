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
} from '../core/types/db.types.js';
import { AccFirm, NewAccFirm } from '../domains/accountingFirms/firms.types.js';
import {
  BankFeedProvider,
  BankFeedProviderCountries,
  NewBankFeedProvider,
  NewBankFeedProviderCountry,
} from '../domains/bankFeedProviders/bankFeedProviders.types.js';
import {
  BankAccount,
  NewBankAccount,
} from '../domains/banking/bankAccounts/bankAccounts.types.js';
import {
  BankProviderMapping,
  NewBankProviderMapping,
} from '../domains/banking/bankProviderMappings/bankProviderMappings.types.js';
import { Bank, NewBank } from '../domains/banking/banks/banks.types.js';
import {
  BankTransaction,
  BankTransactionBatches,
  NewBankTransaction,
  NewBankTransactionBatches,
} from '../domains/bankTransactions/bankTransactions.types.js';
import {
  CategorizationCandidate,
  CategorizationCandidateLine,
  CategorizationConstraintViolation,
} from '../domains/categorization/candidates/candidates.types.js';
import {
  CategorizationPrediction,
  CategorizationPredictionLine,
} from '../domains/categorization/post-prediction/predictions/predictions.types.js';
import {
  NewRule,
  RuleActions,
  RuleConditions,
  RuleLogs,
  Rules,
} from '../domains/categorization/rules/rules-db.types.js';
import {
  CoaTemplate,
  NewCoaTemplateInput,
} from '../domains/chart-of-accounts/coa-template.type.js';
import { Coa, NewCoa } from '../domains/chart-of-accounts/coa.types.js';
import { Company, NewCompany } from '../domains/companies/companies.types.js';
import { Contact, NewContact } from '../domains/contacts/contacts.types.js';
import {
  ExchangeRate,
  NewExchangeRateInput,
} from '../domains/exchangeRates/exchangeRate.types.js';
import {
  type FileRecord,
  type NewFileRecord,
  type NewUploadIntentRecord,
  type UploadIntentRecord,
} from '../domains/objects/objects.types.js';
import { NewProject, Project } from '../domains/projects/projects.types.js';
import { NewRoleInput, Role } from '../domains/roles/roles.types.js';
import { NewToken, Token } from '../domains/tokens/tokens.types.js';
import {
  NewUserCompanyRole,
  UserCompanyRole,
} from '../domains/user-roles/user-roles.types.ts';
import {
  NewUserDirect,
  NewUserInput,
  User,
} from '../domains/users/users.types.js';

import type {
  BankCurrentBalance,
  BankDailyBalanceSnapshot,
  FiscalCalendar,
  GLCurrentBalance,
  GLDailyBalanceSnapshot,
  GLPeriodBalance,
  NewBankCurrentBalance,
  NewBankDailyBalanceSnapshot,
  NewFiscalCalendar,
  NewGLCurrentBalance,
  NewGLDailyBalanceSnapshot,
  NewGLPeriodBalance,
} from '../domains/balances/balances.types.js';
import type {
  BankAccountCredential,
  NewBankAccountCredential,
} from '../domains/banking/bankAccountCredentials/bankAccountCredentials.types.js';
import type {
  JournalBatch,
  JournalEntry,
  NewJournalBatch,
  NewJournalEntry,
} from '../domains/journals/journals.types.js';
import type {
  FiscalCalendar,
  NewFiscalCalendar,
} from '../domains/reporting/fiscal-calendar/fiscal-calendar.types.js';

declare module 'knex/types/tables' {
  interface Tables {
    roles: Knex.CompositeTableType<
      Role,
      NewRoleInput,
      Partial<Omit<Role, 'id'>>
    >;

    permissions: Knex.CompositeTableType<
      Permission,
      NewPermissionInput,
      Partial<Omit<Permission, 'id'>>
    >;

    currencies: Knex.CompositeTableType<
      Currency,
      NewCurrencyInput,
      Partial<Omit<Currency, 'id'>>
    >;

    countries: Knex.CompositeTableType<
      Country,
      NewCountryInput,
      Partial<Omit<Country, 'id'>>
    >;

    exchange_rates: Knex.CompositeTableType<
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

    users: Knex.CompositeTableType<
      User,
      NewUserDirect | NewUserInput,
      Partial<Omit<User, 'id'>>
    >;

    tokens: Knex.CompositeTableType<
      Token,
      NewToken,
      Partial<Omit<Token, 'id'>>
    >;

    companies: Knex.CompositeTableType<
      Company,
      NewCompany,
      Partial<Omit<Company, 'id'>>
    >;

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

    firm_user_client_assignments: Knex.CompositeTableType<
      Fuca,
      NewFuca,
      Partial<Omit<Fuca, 'id'>>
    >;

    role_permissions: Knex.CompositeTableType<
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

    contacts: Knex.CompositeTableType<
      Contact,
      NewContact,
      Partial<Omit<Contact, 'id'>>
    >;

    projects: Knex.CompositeTableType<
      Project,
      NewProject,
      Partial<Omit<Project, 'id'>>
    >;

    files: Knex.CompositeTableType<
      FileRecord,
      NewFileRecord,
      Partial<Omit<FileRecord, 'id'>>
    >;

    upload_intents: Knex.CompositeTableType<
      UploadIntentRecord,
      NewUploadIntentRecord,
      Partial<Omit<UploadIntentRecord, 'id'>>
    >;

    // Categorization rules tables
    rules: Knex.CompositeTableType<Rules, NewRule, Partial<Omit<Rules, 'id'>>>;

    rule_conditions: Knex.CompositeTableType<
      RuleConditions,
      Omit<RuleConditions, 'id'>,
      Partial<Omit<RuleConditions, 'id'>>
    >;

    rule_actions: Knex.CompositeTableType<
      RuleActions,
      Omit<RuleActions, 'id'>,
      Partial<Omit<RuleActions, 'id'>>
    >;

    rule_logs: Knex.CompositeTableType<
      RuleLogs,
      Omit<RuleLogs, 'id'>,
      Partial<Omit<RuleLogs, 'id'>>
    >;

    categorization_predictions: Knex.CompositeTableType<
      CategorizationPrediction,
      Omit<CategorizationPrediction, 'id'>,
      Partial<Omit<CategorizationPrediction, 'id'>>
    >;

    categorization_prediction_lines: Knex.CompositeTableType<
      CategorizationPredictionLine,
      Omit<CategorizationPredictionLine, 'id'>,
      Partial<Omit<CategorizationPredictionLine, 'id'>>
    >;

    categorization_candidates: Knex.CompositeTableType<
      CategorizationCandidate,
      Omit<CategorizationCandidate, 'id'>,
      Partial<Omit<CategorizationCandidate, 'id'>>
    >;

    categorization_candidate_lines: Knex.CompositeTableType<
      CategorizationCandidateLine,
      Omit<CategorizationCandidateLine, 'id'>,
      Partial<Omit<CategorizationCandidateLine, 'id'>>
    >;

    categorization_constraint_violations: Knex.CompositeTableType<
      CategorizationConstraintViolation,
      Omit<CategorizationConstraintViolation, 'id'>,
      Partial<Omit<CategorizationConstraintViolation, 'id'>>
    >;

    // Balance system tables
    fiscal_calendar: Knex.CompositeTableType<
      FiscalCalendar,
      NewFiscalCalendar,
      Partial<
        Omit<
          FiscalCalendar,
          'company_id' | 'fiscal_year' | 'period_number' | 'period_type'
        >
      >
    >;

    gl_daily_balance_snapshots: Knex.CompositeTableType<
      GLDailyBalanceSnapshot,
      NewGLDailyBalanceSnapshot,
      Partial<Omit<GLDailyBalanceSnapshot, 'company_id' | 'coa_id' | 'day'>>
    >;

    bank_account_daily_native_snapshots: Knex.CompositeTableType<
      BankDailyBalanceSnapshot,
      NewBankDailyBalanceSnapshot,
      Partial<
        Omit<BankDailyBalanceSnapshot, 'company_id' | 'bank_account_id' | 'day'>
      >
    >;

    gl_period_balances: Knex.CompositeTableType<
      GLPeriodBalance,
      NewGLPeriodBalance,
      Partial<
        Omit<
          GLPeriodBalance,
          | 'company_id'
          | 'coa_id'
          | 'fiscal_year'
          | 'period_number'
          | 'period_type'
        >
      >
    >;

    gl_current_balances: Knex.CompositeTableType<
      GLCurrentBalance,
      NewGLCurrentBalance,
      Partial<Omit<GLCurrentBalance, 'company_id' | 'coa_id'>>
    >;

    bank_account_current_native_balances: Knex.CompositeTableType<
      BankCurrentBalance,
      NewBankCurrentBalance,
      Partial<Omit<BankCurrentBalance, 'company_id' | 'bank_account_id'>>
    >;

    journal_batches: Knex.CompositeTableType<
      JournalBatch,
      NewJournalBatch,
      Partial<Omit<JournalBatch, 'id'>>
    >;

    journal_entries: Knex.CompositeTableType<
      JournalEntry,
      NewJournalEntry,
      Partial<Omit<JournalEntry, 'id'>>
    >;
  }
}
