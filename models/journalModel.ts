import {
  CategorisationStatus,
  DebitCredit,
  JournalStatus,
  ProjectStatus,
  TransactionSource,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaClient } from "@prisma/client";
import { getIdentifierType } from "../utils/utils";
import { createLedgerEntries, processLedgerTxns } from "./transactionModel";

const prisma = new PrismaClient();

interface FetchJournalFilters {
  searchQuery?: string;
  status?: JournalStatus[];
  startDate?: Date;
  endDate?: Date;
  includeEntries?: boolean;
  page?: number;
  pageSize?: number;
}

interface JournalEntryInput {
  date?: Date;
  description?: string;
  side: DebitCredit;
  amount: Decimal;
  coaAccountId: string;
  projectName?: string;
  projectId?: string;
}

export type JournalData = {
  date: Date;
  description: string;
  note?: string;
  transactions: JournalEntryInput[];
  status: JournalStatus;
  autoReversalDate?: Date;
  generatedFromTemplateId?: string;
};

export async function fetchJournals(
  companyIdentifier: string,
  filters?: FetchJournalFilters
) {
  try {
    const companyIdType = getIdentifierType(companyIdentifier);

    const companyData = await prisma.company.findUnique({
      where: {
        ...(companyIdType === "uuid"
          ? { id: companyIdentifier }
          : { shortCode: companyIdentifier }),
      },
      select: { id: true },
    });

    const companyId = companyData?.id;

    let where: any = {
      companyId,
      isDeleted: false,
    };

    if (filters?.searchQuery) {
      const searchQuery = filters.searchQuery.toUpperCase() || "";

      if (Object.values(JournalStatus).includes(searchQuery as JournalStatus)) {
        where.OR = [
          { status: searchQuery as JournalStatus },
          { description: { search: `${searchQuery}:*`, mode: "insensitive" } },
          { note: { search: `${searchQuery}:*`, mode: "insensitive" } },
        ];
      } else {
        where.OR = [
          { description: { search: `${searchQuery}:*`, mode: "insensitive" } },
          { note: { search: `${searchQuery}:*`, mode: "insensitive" } },
        ];
      }
    }

    const journals = await prisma.journalBatch.findMany({
      where,
      select: {
        id: true,
        sequenceNumber: true,
        date: true,
        description: true,
        note: true,
        status: true,
        ledgerTransactionId: true,
        autoReversalDate: true,
        reversedJournalId: true,
        _count: {
          select: {
            journalTransactions: true,
          },
        },
      },
    });

    const count = await prisma.journalBatch.count({
      where,
    });

    if (journals) {
      return {
        success: true,
        data: {
          journals,
          count,
        },
      };
    } else {
      return {
        success: false,
        message: "An unexpected error occurred",
      };
    }
  } catch (error: any) {
    console.error(error);
    return {
      success: false,
      message: "Failed to retrieve transactions",
      error: error.message,
    };
  }
}

export async function fetchJournalById(companyId: string, journalId: string) {}

export async function insertJournalRecords(
  companyIdentifier: string,
  userId: string,
  journalData: JournalData[]
) {
  // Validate companyId and journalData, ensure company exists, journalData is not empty, is an arry, and all required fields are present
  const companyIdType = getIdentifierType(companyIdentifier);

  const companyData = await prisma.company.findUnique({
    where: {
      ...(companyIdType === "uuid"
        ? { id: companyIdentifier }
        : { shortCode: companyIdentifier }),
    },
    select: { id: true, reportingCurrencyId: true },
  });

  const companyId = companyData?.id;
  const reportingCurrencyId = companyData?.reportingCurrencyId;

  if (
    !companyIdentifier ||
    !journalData ||
    !companyId ||
    !reportingCurrencyId
  ) {
    return { success: false, message: "Bad Request" };
  }

  if (!Array.isArray(journalData) || journalData.length === 0) {
    return {
      success: false,
      message: "Journal data must be a non-empty array",
    };
  }

  try {
    const errorString: string[] = [];

    const allCoaIds = journalData.flatMap((b) =>
      b.transactions.map((t) => t.coaAccountId)
    );
    const validCoas = await prisma.coa.findMany({
      where: { id: { in: allCoaIds } },
    });
    const validCoaIds = new Set(validCoas.map((c) => c.id));

    // Validate all batches and transactions
    for (const [batchIndex, batch] of journalData.entries()) {
      // Batch-level validation
      if (!batch.date || !batch.description || !batch.status) {
        errorString.push(
          `Batch ${batchIndex + 1}: Missing required fields (date, description, status)`
        );
      }

      if (
        !Array.isArray(batch.transactions) ||
        batch.transactions.length === 0
      ) {
        errorString.push(`Batch ${batchIndex + 1}: No transactions provided`);
      } else {
        // Transaction-level validation and balance check
        let totalDebit = new Decimal(0);
        let totalCredit = new Decimal(0);

        for (const [txIndex, transaction] of batch.transactions.entries()) {
          if (!validCoaIds.has(transaction.coaAccountId)) {
            errorString.push(
              `Batch ${batchIndex + 1}, Transaction ${txIndex + 1}: Invalid coaAccountId`
            );
          }

          if (
            !transaction.side ||
            !transaction.amount ||
            !transaction.coaAccountId
          ) {
            errorString.push(
              `Batch ${batchIndex + 1}, Transaction ${txIndex + 1}: Missing required fields`
            );
          } else {
            // Only accumulate if validation passes for this transaction
            if (transaction.side === DebitCredit.DEBIT) {
              totalDebit = totalDebit.add(transaction.amount);
            } else {
              totalCredit = totalCredit.add(transaction.amount);
            }
          }
        }

        if (!totalDebit.equals(totalCredit.abs())) {
          errorString.push(
            `Batch ${batchIndex + 1}: Debits (${totalDebit}) do not match credits (${totalCredit})`
          );
        }
      }
    }

    if (errorString.length > 0) {
      return {
        success: false,
        message: "Validation failed",
        errors: errorString,
      };
    }
    // If there are errors, return at this point

    // Insert journal records into database (if no errors)
    const createdJournalBatches = await prisma.$transaction(async (tx) => {
      // Get current max sequence number for the company

      const createdBatches = [];
      let totalEntries = 0;

      for (const batch of journalData) {
        let sequenceNumber: number;

        const lastBatch = await tx.journalBatch.findFirst({
          where: { companyId },
          orderBy: { sequenceNumber: "desc" },
          select: { sequenceNumber: true },
        });

        sequenceNumber = (lastBatch?.sequenceNumber || 0) + 1;

        const ledgerTxn = await tx.ledgerTransaction.create({
          data: {
            date: batch.date,
            description: batch.description,
            source: TransactionSource.MANUAL_JOURNAL,
            companyId,
            createdById: userId,
            updatedById: userId,
          },
        });

        // Create JournalBatch
        const newBatch = await tx.journalBatch.create({
          data: {
            companyId,
            sequenceNumber: sequenceNumber,
            date: batch.date,
            description: batch.description,
            status: batch.status,
            note: batch.note,
            postedById: userId,
            autoReversalDate: batch.autoReversalDate,
            generatedFromTemplateId: batch.generatedFromTemplateId,
            updatedById: userId,
            postedAt: new Date(),
            ledgerTransactionId: ledgerTxn.id,
          },
        });

        const ledgerEntries = await Promise.all(
          batch.transactions.map(async (transaction) => {
            let projectId = transaction.projectId;
            let projectName = transaction.projectName;
            let project;

            if (projectId) {
              project = await prisma.project.findUnique({
                where: { id: projectId },
              });

              if (!project) {
                projectId = undefined;
              } else if (projectName) {
                project = await prisma.project.findFirst({
                  where: { name: projectName, companyId },
                });

                if (!project) {
                  project = await prisma.project.create({
                    data: {
                      name: projectName,
                      companyId,
                      status: ProjectStatus.ACTIVE,
                    },
                  });
                }

                projectId = project.id;
              }
            }

            const ledgerEntry = await tx.ledgerEntry.create({
              data: {
                ledgerTransactionId: ledgerTxn.id,
                fsDate: transaction.date || batch.date,
                coaId: transaction.coaAccountId,
                transactionSide: transaction.side,
                sourceCurrencyId: reportingCurrencyId,
                sourceAmount: new Decimal(transaction.amount),
                absoluteSourceAmount: new Decimal(transaction.amount).abs(),
                systemExchangeRate: new Decimal(1),
                customExchangeRate: new Decimal(1),
                amount: new Decimal(transaction.amount),
                absoluteAmount: new Decimal(transaction.amount).abs(),
                categorisationStatus: CategorisationStatus.CATEGORISED,
                description: transaction.description || batch.description,
                ...(transaction.projectId
                  ? { projectId: transaction.projectId }
                  : {}),
                updatedById: userId,
              },
            });

            return ledgerEntry;
          })
        );

        const journalEntriesData = batch.transactions.map(
          (transaction, index) => ({
            description: transaction.description || batch.description,
            side: transaction.side,
            amount: transaction.amount,
            coaAccountId: transaction.coaAccountId,
            journalBatchId: newBatch.id,
            ledgerEntryId: ledgerEntries[index].id,
          })
        );

        await tx.journalEntry.createMany({
          data: journalEntriesData,
        });

        createdBatches.push(newBatch);
        totalEntries += journalEntriesData.length;
      }

      return createdBatches;
    });

    return {
      success: true,
      message: "Journal records created successfully",
      data: {
        createdBatchIds: createdJournalBatches.map(
          (batch) => `Journal Batch ${batch.sequenceNumber}`
        ),
      },
    };
  } catch (error: any) {
    console.error("Error in insertJournal:", error);
    return {
      success: false,
      message: "Failed to create journal records",
      error: error.message,
    };
  }

  // Ensure journal balances (debits = credits) before inserting
  // Insert journal records into database
  // Return success or failure message, If success, return the created journal id and status and other data that can help the caller
  // e.g number of journals received, created, failed
}

export async function insertRecurringJournal() {}

export async function updateSingleJournal() {}
export async function insertReversalJournal() {}
export async function markJournalAsDeleted() {}
