/*
  Warnings:

  - A unique constraint covering the columns `[name,companyId]` on the table `Contact` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code,companyId]` on the table `Project` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Project_name_code_companyId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Contact_name_companyId_key" ON "Contact"("name", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_companyId_key" ON "Project"("code", "companyId");
