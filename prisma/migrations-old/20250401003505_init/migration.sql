-- DropIndex
DROP INDEX "banktx_categorisation_status_idx";

-- AlterTable
ALTER TABLE "BankTransaction" RENAME CONSTRAINT "BankTransaction_pkey1" TO "BankTransaction_pkey";

-- AlterTable
ALTER TABLE "LedgerEntry" RENAME CONSTRAINT "LedgerEntry_pkey1" TO "LedgerEntry_pkey";

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankTransactionBatchId_fkey" FOREIGN KEY ("bankTransactionBatchId") REFERENCES "BankTransactionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_bankTransactionId_bankTransactionDate_fkey" FOREIGN KEY ("bankTransactionId", "bankTransactionDate") REFERENCES "BankTransaction"("id", "date") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_coaId_fkey" FOREIGN KEY ("coaId") REFERENCES "Coa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_sourceCurrencyId_fkey" FOREIGN KEY ("sourceCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_ledgerEntryId_ledgerEntryfsDate_fkey" FOREIGN KEY ("ledgerEntryId", "ledgerEntryfsDate") REFERENCES "LedgerEntry"("id", "fsDate") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "BankTransaction_id_date_idx1" RENAME TO "BankTransaction_id_date_idx";

-- RenameIndex
ALTER INDEX "BankTransaction_id_date_idx2" RENAME TO "BankTransaction_id_date_key";

-- RenameIndex
ALTER INDEX "BankTransaction_ledgerTransactionId_idx1" RENAME TO "BankTransaction_ledgerTransactionId_idx";

-- RenameIndex
ALTER INDEX "LedgerEntry_categorisationStatus_idx1" RENAME TO "LedgerEntry_categorisationStatus_idx";

-- RenameIndex
ALTER INDEX "LedgerEntry_coaId_isDeleted_idx1" RENAME TO "LedgerEntry_coaId_isDeleted_idx";

-- RenameIndex
ALTER INDEX "LedgerEntry_id_fsDate_idx" RENAME TO "LedgerEntry_id_fsDate_key";

-- RenameIndex
ALTER INDEX "LedgerEntry_ledgerTransactionId_idx1" RENAME TO "LedgerEntry_ledgerTransactionId_idx";
