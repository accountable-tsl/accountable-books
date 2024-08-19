-- CreateEnum
CREATE TYPE "AccountElement" AS ENUM ('asset', 'liabilities', 'equity', 'revenue', 'expense');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('current_assets', 'noncurrent_assets', 'fixed_assets', 'current_liabilities', 'noncurrent_liabilities', 'revenue', 'income', 'other_income', 'finance_income', 'cost_of_sales', 'operating_expenses', 'noncash_charges', 'depreciation', 'amortisation', 'finance_costs', 'tax_expense', 'equity');

-- CreateEnum
CREATE TYPE "FinancialStatement" AS ENUM ('balance_sheet', 'income_statement');

-- CreateEnum
CREATE TYPE "DebitCredit" AS ENUM ('debit', 'credit');

-- CreateTable
CREATE TABLE "COA" (
    "id" SERIAL NOT NULL,
    "accountCode" TEXT,
    "accountName" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "element" "AccountElement" NOT NULL,
    "financialStatement" "FinancialStatement" NOT NULL,
    "debitOrCredit" "DebitCredit",
    "sign" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "companyId" INTEGER NOT NULL,
    "templateId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "COA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "COATemplate" (
    "id" SERIAL NOT NULL,
    "templateName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "COATemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "COA_companyId_idx" ON "COA"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "COA_accountName_companyId_key" ON "COA"("accountName", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "COA_accountCode_companyId_key" ON "COA"("accountCode", "companyId");

-- AddForeignKey
ALTER TABLE "COA" ADD CONSTRAINT "COA_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "COA" ADD CONSTRAINT "COA_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "COATemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
