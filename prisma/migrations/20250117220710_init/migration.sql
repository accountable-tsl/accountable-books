/*
  Warnings:

  - You are about to drop the column `categorisedAt` on the `BankTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `categorisedById` on the `BankTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `isCategorised` on the `BankTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `categorisedAt` on the `LedgerTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `categorisedById` on the `LedgerTransaction` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "BankTransaction" DROP CONSTRAINT "BankTransaction_categorisedById_fkey";

-- DropForeignKey
ALTER TABLE "LedgerTransaction" DROP CONSTRAINT "LedgerTransaction_categorisedById_fkey";

-- AlterTable
ALTER TABLE "BankTransaction" DROP COLUMN "categorisedAt",
DROP COLUMN "categorisedById",
DROP COLUMN "isCategorised";

-- AlterTable
ALTER TABLE "LedgerTransaction" DROP COLUMN "categorisedAt",
DROP COLUMN "categorisedById";
