-- CreateEnum
CREATE TYPE "DefaultSide" AS ENUM ('Debit', 'Credit');

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
    "country" TEXT NOT NULL,
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
CREATE INDEX "Coa_companyId_idx" ON "Coa"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Coa_accountName_companyId_key" ON "Coa"("accountName", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Coa_accountCode_companyId_key" ON "Coa"("accountCode", "companyId");

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
