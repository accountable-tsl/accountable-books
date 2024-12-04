-- CreateEnum
CREATE TYPE "DefaultSide" AS ENUM ('Debit', 'Credit');

-- CreateEnum
CREATE TYPE "BankTransactionStatus" AS ENUM ('RECONCILED', 'UNRECONCILED');

-- CreateEnum
CREATE TYPE "BankTransactionSource" AS ENUM ('IMPORTED', 'CONNECTED', 'MANUAL');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('OTHER', 'CREDIT_CARD', 'DEBIT_CARD', 'SAVINGS', 'CHECKINGS_CURRENT', 'UTILITY');

-- CreateEnum
CREATE TYPE "AccountTransactionSource" AS ENUM ('BANK', 'JOURNAL');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "firstname" TEXT NOT NULL,
    "lastname" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "roleId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "profileImage" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "teamSize" TEXT,
    "revenue" TEXT,
    "countryId" INTEGER NOT NULL,
    "reportingCurrencyId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCompany" (
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCompany_pkey" PRIMARY KEY ("userId","companyId")
);

-- CreateTable
CREATE TABLE "Currency" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneCode" TEXT NOT NULL,
    "flag" TEXT,
    "continent" TEXT,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialStatement" (
    "id" SERIAL NOT NULL,
    "statementKey" TEXT NOT NULL,
    "usGaapLabel" TEXT NOT NULL,
    "ifrsLabel" TEXT NOT NULL,
    "defaultLabel" TEXT NOT NULL,

    CONSTRAINT "FinancialStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountElement" (
    "id" SERIAL NOT NULL,
    "elementName" TEXT NOT NULL,
    "defaultSide" "DefaultSide" NOT NULL,
    "parentId" INTEGER,
    "financialStatementId" INTEGER NOT NULL,
    "description" TEXT,

    CONSTRAINT "AccountElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountType" (
    "id" SERIAL NOT NULL,
    "typeName" VARCHAR(255) NOT NULL,
    "accountElementId" INTEGER NOT NULL,
    "description" VARCHAR(255),

    CONSTRAINT "AccountType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coa" (
    "id" SERIAL NOT NULL,
    "accountCode" TEXT,
    "accountName" TEXT NOT NULL,
    "description" TEXT,
    "accountTypeId" INTEGER NOT NULL,
    "defaultSide" "DefaultSide" NOT NULL,
    "currencyId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "bankAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoaTemplate" (
    "id" SERIAL NOT NULL,
    "templateName" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountTypeId" INTEGER NOT NULL,
    "defaultSide" "DefaultSide" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoaTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bank" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "bankLogo" TEXT,
    "countryId" INTEGER NOT NULL,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "bankId" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "bankAccountType" "BankAccountType" NOT NULL,
    "bankAccountNo" TEXT NOT NULL,
    "bankBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lastReconciled" TIMESTAMP(3),
    "currencyId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "coaId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "createdBy" INTEGER,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "source" "BankTransactionSource" NOT NULL,
    "type" "DefaultSide" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciledAt" TIMESTAMP(3),
    "reconciledBy" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "bankTransactionBatchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountTransaction" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "contact" TEXT,
    "description" TEXT,
    "source" "AccountTransactionSource" NOT NULL,
    "type" TEXT,
    "reference" TEXT,
    "sourceDebit" DECIMAL(65,30) NOT NULL,
    "sourceCredit" DECIMAL(65,30) NOT NULL,
    "exchangeRate" DECIMAL(65,30) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "project" TEXT,
    "coaAccountId" INTEGER NOT NULL,
    "bankTransactionId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" INTEGER,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalBatch" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" "JournalStatus" NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "userId" INTEGER NOT NULL,
    "postedAt" TIMESTAMP(3),
    "postedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalTransaction" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "side" "DefaultSide" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "journalBatchId" TEXT NOT NULL,
    "coaAccountId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurrenceDetails" (
    "id" TEXT NOT NULL,
    "journalBatchId" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextRun" TIMESTAMP(3),

    CONSTRAINT "RecurrenceDetails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "Role_name_idx" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_status_idx" ON "User"("email", "status");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

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
CREATE INDEX "BankTransaction_bankTransactionBatchId_idx" ON "BankTransaction"("bankTransactionBatchId");

-- CreateIndex
CREATE INDEX "BankTransaction_date_idx" ON "BankTransaction"("date");

-- CreateIndex
CREATE INDEX "BankTransaction_payee_idx" ON "BankTransaction"("payee");

-- CreateIndex
CREATE UNIQUE INDEX "AccountTransaction_bankTransactionId_key" ON "AccountTransaction"("bankTransactionId");

-- CreateIndex
CREATE INDEX "JournalTransaction_journalBatchId_idx" ON "JournalTransaction"("journalBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurrenceDetails_journalBatchId_key" ON "RecurrenceDetails"("journalBatchId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_reportingCurrencyId_fkey" FOREIGN KEY ("reportingCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountElement" ADD CONSTRAINT "AccountElement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccountElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountElement" ADD CONSTRAINT "AccountElement_financialStatementId_fkey" FOREIGN KEY ("financialStatementId") REFERENCES "FinancialStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountType" ADD CONSTRAINT "AccountType_accountElementId_fkey" FOREIGN KEY ("accountElementId") REFERENCES "AccountElement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coa" ADD CONSTRAINT "Coa_accountTypeId_fkey" FOREIGN KEY ("accountTypeId") REFERENCES "AccountType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coa" ADD CONSTRAINT "Coa_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coa" ADD CONSTRAINT "Coa_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bank" ADD CONSTRAINT "Bank_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_coaId_fkey" FOREIGN KEY ("coaId") REFERENCES "Coa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionBatch" ADD CONSTRAINT "BankTransactionBatch_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankTransactionBatchId_fkey" FOREIGN KEY ("bankTransactionBatchId") REFERENCES "BankTransactionBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_coaAccountId_fkey" FOREIGN KEY ("coaAccountId") REFERENCES "Coa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalBatch" ADD CONSTRAINT "JournalBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_journalBatchId_fkey" FOREIGN KEY ("journalBatchId") REFERENCES "JournalBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_coaAccountId_fkey" FOREIGN KEY ("coaAccountId") REFERENCES "Coa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceDetails" ADD CONSTRAINT "RecurrenceDetails_journalBatchId_fkey" FOREIGN KEY ("journalBatchId") REFERENCES "JournalBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
