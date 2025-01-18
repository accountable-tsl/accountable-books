/*
  Warnings:

  - A unique constraint covering the columns `[name,code,companyId]` on the table `Project` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Project_code_companyId_key";

-- DropIndex
DROP INDEX "Project_name_companyId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_code_companyId_key" ON "Project"("name", "code", "companyId");
