-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserCompanyRole" AS ENUM ('ADMIN', 'BOOKKEEPER', 'VIEWER');

-- CreateEnum
CREATE TYPE "FsKey" AS ENUM ('BALANCE_SHEET', 'INCOME_STATEMENT');

-- CreateEnum
CREATE TYPE "DebitCredit" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "BankTransactionSource" AS ENUM ('FILE_IMPORT', 'BANK_FEED', 'MANUAL_ENTRY');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('OTHER', 'CREDIT_CARD', 'DEBIT_CARD', 'SAVINGS', 'CHECKINGS_CURRENT', 'UTILITY');

-- CreateEnum
CREATE TYPE "CategorisationStatus" AS ENUM ('UNCATEGORISED', 'AUTO_CATEGORISED', 'CATEGORISED');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('BANK', 'MANUAL_JOURNAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "JournalReversalReason" AS ENUM ('AUTO_REVERSAL', 'VOIDED');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "RecurringJournalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('SUPPLIER', 'CUSTOMER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('IN_DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SnapshotPeriodType" AS ENUM ('MONTH', 'QUARTER', 'ANNUAL');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstname" TEXT NOT NULL,
    "lastname" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "roleId" TEXT NOT NULL,
    "profileImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "teamSize" TEXT,
    "revenue" TEXT,
    "yearEndDay" INTEGER NOT NULL,
    "yearEndMonth" INTEGER NOT NULL,
    "countryId" TEXT NOT NULL,
    "reportingCurrencyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCompany" (
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "UserCompanyRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCompany_pkey" PRIMARY KEY ("userId","companyId")
);

-- CreateTable
CREATE TABLE "Currency" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneCode" TEXT NOT NULL,
    "flag" TEXT,
    "continent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialStatement" (
    "id" TEXT NOT NULL,
    "statementKey" "FsKey" NOT NULL,
    "usGaapLabel" TEXT NOT NULL,
    "ifrsLabel" TEXT NOT NULL,
    "defaultLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountElement" (
    "id" TEXT NOT NULL,
    "elementName" TEXT NOT NULL,
    "defaultSide" "DebitCredit" NOT NULL,
    "parentId" TEXT,
    "financialStatementId" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AccountElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountType" (
    "id" TEXT NOT NULL,
    "typeName" VARCHAR(255) NOT NULL,
    "accountElementId" TEXT NOT NULL,
    "description" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AccountType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coa" (
    "id" TEXT NOT NULL,
    "fsKey" "FsKey" NOT NULL,
    "accountCode" TEXT,
    "accountName" TEXT NOT NULL,
    "description" TEXT,
    "accountTypeId" TEXT NOT NULL,
    "defaultSide" "DebitCredit" NOT NULL,
    "currencyId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bankAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Coa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoaTemplate" (
    "id" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountTypeId" TEXT NOT NULL,
    "defaultSide" "DebitCredit" NOT NULL,
    "fsKey" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CoaTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankLogo" TEXT,
    "countryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bankAccountType" "BankAccountType" NOT NULL,
    "bankAccountNo" TEXT NOT NULL,
    "bankBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lastReconciled" TIMESTAMP(3),
    "currencyId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "coaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "liveBankAccountBalanceId" TEXT,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransactionBatch" (
    "id" TEXT NOT NULL,
    "importedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "balanceBefore" DECIMAL(65,30) NOT NULL,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "source" "BankTransactionSource" NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BankTransactionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "payee" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "additionalComments" TEXT,
    "transactionSide" "DebitCredit",
    "amount" DECIMAL(65,30) NOT NULL,
    "absoluteAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "systemExchangeRate" DECIMAL(65,30) NOT NULL,
    "categorisationStatus" "CategorisationStatus" NOT NULL DEFAULT 'UNCATEGORISED',
    "bankAccountId" TEXT NOT NULL,
    "bankTransactionBatchId" TEXT,
    "ledgerTransactionId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BankTransaction_pkey1" PRIMARY KEY ("id","date")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "contactId" TEXT,
    "description" TEXT,
    "source" "TransactionSource" NOT NULL,
    "reference" TEXT,
    "bankTransactionId" TEXT,
    "bankTransactionDate" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "ledgerTransactionId" TEXT NOT NULL,
    "fsDate" TIMESTAMP(3) NOT NULL,
    "coaId" TEXT NOT NULL,
    "transactionSide" "DebitCredit" NOT NULL,
    "sourceCurrencyId" TEXT NOT NULL,
    "sourceAmount" DECIMAL(65,30) NOT NULL,
    "absoluteSourceAmount" DECIMAL(65,30) NOT NULL,
    "systemExchangeRate" DECIMAL(65,30) NOT NULL,
    "customExchangeRate" DECIMAL(65,30) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "absoluteAmount" DECIMAL(65,30) NOT NULL,
    "categorisationStatus" "CategorisationStatus" NOT NULL DEFAULT 'AUTO_CATEGORISED',
    "description" TEXT,
    "projectId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LedgerEntry_pkey1" PRIMARY KEY ("id","fsDate")
);

-- CreateTable
CREATE TABLE "JournalBatch" (
    "id" TEXT NOT NULL,
    "sequenceNumber" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "note" TEXT,
    "status" "JournalStatus" NOT NULL,
    "generatedFromTemplateId" TEXT,
    "ledgerTransactionId" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "updatedById" TEXT,
    "companyId" TEXT NOT NULL,
    "autoReversalDate" TIMESTAMP(3),
    "reversedJournalId" TEXT,
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" "JournalReversalReason",
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JournalBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "description" TEXT,
    "side" "DebitCredit" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "journalBatchId" TEXT NOT NULL,
    "coaAccountId" TEXT NOT NULL,
    "ledgerEntryId" TEXT,
    "ledgerEntryfsDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringJournalTemplate" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "note" TEXT,
    "status" "RecurringJournalStatus" NOT NULL,
    "companyId" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextRunDate" TIMESTAMP(3),
    "placeholderVars" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RecurringJournalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringJournalTemplateEntry" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "side" "DebitCredit" NOT NULL,
    "coaAccountId" TEXT NOT NULL,
    "placeholderDescriptionVar" TEXT,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "RecurringJournalTemplateEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "fromCurrencyId" TEXT NOT NULL,
    "toCurrencyId" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "contactCode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "primaryEmail" TEXT,
    "secondaryEmail" TEXT,
    "address" TEXT,
    "website" TEXT,
    "businessRegNo" TEXT,
    "contactType" "ContactType",
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" DEFAULT 'IN_DRAFT',
    "contactId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveBankAccountBalance" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "nativeBalance" DECIMAL(65,30) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveBankAccountBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveBankLedgerBalance" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "nativeBalance" DECIMAL(65,30) NOT NULL,
    "reportingBalance" DECIMAL(65,30) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveBankLedgerBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveCoaAccountBalance" (
    "id" TEXT NOT NULL,
    "coaId" TEXT NOT NULL,
    "liveBalance" DECIMAL(65,30) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveCoaAccountBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PLBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "coaId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodType" "SnapshotPeriodType" NOT NULL,
    "openingBalance" DECIMAL(65,30) NOT NULL,
    "totalMovement" DECIMAL(65,30) NOT NULL,
    "closingBalance" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PLBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceSheetSnapshot" (
    "id" TEXT NOT NULL,
    "coaId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "cumulativeBalance" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalanceSheetSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrentAccountingPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrentAccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "Role_id_idx" ON "Role"("id");

-- CreateIndex
CREATE INDEX "Role_name_idx" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_status_idx" ON "User"("email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Company_shortCode_key" ON "Company"("shortCode");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Company_shortCode_idx" ON "Company"("shortCode");

-- CreateIndex
CREATE INDEX "Company_countryId_idx" ON "Company"("countryId");

-- CreateIndex
CREATE INDEX "UserCompany_userId_companyId_idx" ON "UserCompany"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_code_key" ON "Currency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_name_key" ON "Currency"("name");

-- CreateIndex
CREATE INDEX "Currency_code_idx" ON "Currency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Country_code_key" ON "Country"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatement_statementKey_key" ON "FinancialStatement"("statementKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountType_typeName_key" ON "AccountType"("typeName");

-- CreateIndex
CREATE UNIQUE INDEX "Coa_bankAccountId_key" ON "Coa"("bankAccountId");

-- CreateIndex
CREATE INDEX "Coa_companyId_idx" ON "Coa"("companyId");

-- CreateIndex
CREATE INDEX "Coa_companyId_isDeleted_idx" ON "Coa"("companyId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "Coa_accountName_companyId_key" ON "Coa"("accountName", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Coa_accountCode_companyId_key" ON "Coa"("accountCode", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_coaId_key" ON "BankAccount"("coaId");

-- CreateIndex
CREATE INDEX "BankAccount_companyId_idx" ON "BankAccount"("companyId");

-- CreateIndex
CREATE INDEX "BankAccount_currencyId_idx" ON "BankAccount"("currencyId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_companyId_bankAccountNo_bankId_key" ON "BankAccount"("companyId", "bankAccountNo", "bankId");

-- CreateIndex
CREATE INDEX "BankTransactionBatch_bankAccountId_idx" ON "BankTransactionBatch"("bankAccountId");

-- CreateIndex
CREATE INDEX "BankTransactionBatch_startDate_endDate_idx" ON "BankTransactionBatch"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "BankTransaction_bankTransactionBatchId_idx1" ON "BankTransaction"("bankTransactionBatchId");

-- CreateIndex
CREATE INDEX "BankTransaction_date_idx1" ON "BankTransaction"("date");

-- CreateIndex
CREATE INDEX "BankTransaction_id_date_idx1" ON "BankTransaction"("id", "date");

-- CreateIndex
CREATE INDEX "BankTransaction_ledgerTransactionId_idx1" ON "BankTransaction"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "banktx_batch_id_idx" ON "BankTransaction"("bankTransactionBatchId");

-- CreateIndex
CREATE INDEX "banktx_categorisation_status_idx" ON "BankTransaction"("categorisationStatus");

-- CreateIndex
CREATE INDEX "banktx_date_idx" ON "BankTransaction"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_id_date_idx2" ON "BankTransaction"("id", "date");

-- CreateIndex
CREATE INDEX "LedgerTransaction_date_idx" ON "LedgerTransaction"("date");

-- CreateIndex
CREATE INDEX "LedgerTransaction_source_idx" ON "LedgerTransaction"("source");

-- CreateIndex
CREATE INDEX "LedgerTransaction_contactId_idx" ON "LedgerTransaction"("contactId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_companyId_idx" ON "LedgerTransaction"("companyId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_bankTransactionId_idx" ON "LedgerTransaction"("bankTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_bankTransactionId_bankTransactionDate_key" ON "LedgerTransaction"("bankTransactionId", "bankTransactionDate");

-- CreateIndex
CREATE INDEX "LedgerEntry_categorisationStatus_idx1" ON "LedgerEntry"("categorisationStatus");

-- CreateIndex
CREATE INDEX "LedgerEntry_coaId_fsDate_idx1" ON "LedgerEntry"("coaId", "fsDate");

-- CreateIndex
CREATE INDEX "LedgerEntry_coaId_isDeleted_idx1" ON "LedgerEntry"("coaId", "isDeleted");

-- CreateIndex
CREATE INDEX "LedgerEntry_fsDate_idx1" ON "LedgerEntry"("fsDate");

-- CreateIndex
CREATE INDEX "LedgerEntry_ledgerTransactionId_idx1" ON "LedgerEntry"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "ledger_entry_coaid_fsdate_idx" ON "LedgerEntry"("coaId", "fsDate");

-- CreateIndex
CREATE INDEX "ledger_entry_fsdate_idx" ON "LedgerEntry"("fsDate");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_id_fsDate_idx" ON "LedgerEntry"("id", "fsDate");

-- CreateIndex
CREATE UNIQUE INDEX "JournalBatch_ledgerTransactionId_key" ON "JournalBatch"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "JournalBatch_status_companyId_idx" ON "JournalBatch"("status", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalBatch_companyId_sequenceNumber_key" ON "JournalBatch"("companyId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "JournalEntry_journalBatchId_idx" ON "JournalEntry"("journalBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_ledgerEntryId_ledgerEntryfsDate_key" ON "JournalEntry"("ledgerEntryId", "ledgerEntryfsDate");

-- CreateIndex
CREATE INDEX "RecurringJournalTemplate_frequency_nextRunDate_idx" ON "RecurringJournalTemplate"("frequency", "nextRunDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_fromCurrencyId_toCurrencyId_date_key" ON "ExchangeRate"("fromCurrencyId", "toCurrencyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_name_companyId_key" ON "Contact"("name", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_companyId_key" ON "Project"("code", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_companyId_key" ON "Project"("name", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveBankAccountBalance_bankAccountId_key" ON "LiveBankAccountBalance"("bankAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveBankLedgerBalance_bankAccountId_key" ON "LiveBankLedgerBalance"("bankAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveCoaAccountBalance_coaId_key" ON "LiveCoaAccountBalance"("coaId");

-- CreateIndex
CREATE INDEX "LiveCoaAccountBalance_coaId_idx" ON "LiveCoaAccountBalance"("coaId");

-- CreateIndex
CREATE INDEX "PLBalanceSnapshot_periodStart_idx" ON "PLBalanceSnapshot"("periodStart");

-- CreateIndex
CREATE INDEX "PLBalanceSnapshot_coaId_periodEnd_idx" ON "PLBalanceSnapshot"("coaId", "periodEnd");

-- CreateIndex
CREATE INDEX "PLBalanceSnapshot_coaId_periodStart_periodEnd_idx" ON "PLBalanceSnapshot"("coaId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PLBalanceSnapshot_coaId_periodStart_periodEnd_key" ON "PLBalanceSnapshot"("coaId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "BalanceSheetSnapshot_coaId_snapshotDate_idx" ON "BalanceSheetSnapshot"("coaId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceSheetSnapshot_coaId_snapshotDate_key" ON "BalanceSheetSnapshot"("coaId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "CurrentAccountingPeriod_companyId_key" ON "CurrentAccountingPeriod"("companyId");

-- CreateIndex
CREATE INDEX "CurrentAccountingPeriod_companyId_idx" ON "CurrentAccountingPeriod"("companyId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_reportingCurrencyId_fkey" FOREIGN KEY ("reportingCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountElement" ADD CONSTRAINT "AccountElement_financialStatementId_fkey" FOREIGN KEY ("financialStatementId") REFERENCES "FinancialStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountElement" ADD CONSTRAINT "AccountElement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccountElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountType" ADD CONSTRAINT "AccountType_accountElementId_fkey" FOREIGN KEY ("accountElementId") REFERENCES "AccountElement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coa" ADD CONSTRAINT "Coa_accountTypeId_fkey" FOREIGN KEY ("accountTypeId") REFERENCES "AccountType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coa" ADD CONSTRAINT "Coa_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coa" ADD CONSTRAINT "Coa_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bank" ADD CONSTRAINT "Bank_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_coaId_fkey" FOREIGN KEY ("coaId") REFERENCES "Coa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionBatch" ADD CONSTRAINT "BankTransactionBatch_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionBatch" ADD CONSTRAINT "BankTransactionBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionBatch" ADD CONSTRAINT "BankTransactionBatch_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalBatch" ADD CONSTRAINT "JournalBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalBatch" ADD CONSTRAINT "JournalBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalBatch" ADD CONSTRAINT "JournalBatch_generatedFromTemplateId_fkey" FOREIGN KEY ("generatedFromTemplateId") REFERENCES "RecurringJournalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalBatch" ADD CONSTRAINT "JournalBatch_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalBatch" ADD CONSTRAINT "JournalBatch_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalBatch" ADD CONSTRAINT "JournalBatch_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalBatch" ADD CONSTRAINT "JournalBatch_reversedJournalId_fkey" FOREIGN KEY ("reversedJournalId") REFERENCES "JournalBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalBatch" ADD CONSTRAINT "JournalBatch_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_coaAccountId_fkey" FOREIGN KEY ("coaAccountId") REFERENCES "Coa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_journalBatchId_fkey" FOREIGN KEY ("journalBatchId") REFERENCES "JournalBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJournalTemplate" ADD CONSTRAINT "RecurringJournalTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJournalTemplateEntry" ADD CONSTRAINT "RecurringJournalTemplateEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecurringJournalTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_fromCurrencyId_fkey" FOREIGN KEY ("fromCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_toCurrencyId_fkey" FOREIGN KEY ("toCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBankAccountBalance" ADD CONSTRAINT "LiveBankAccountBalance_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBankLedgerBalance" ADD CONSTRAINT "LiveBankLedgerBalance_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveCoaAccountBalance" ADD CONSTRAINT "LiveCoaAccountBalance_coaId_fkey" FOREIGN KEY ("coaId") REFERENCES "Coa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentAccountingPeriod" ADD CONSTRAINT "CurrentAccountingPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
