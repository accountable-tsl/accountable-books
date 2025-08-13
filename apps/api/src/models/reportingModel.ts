import { PrismaClient } from "@prisma/client";
import { getIdentifierType } from "../utils/utils-old";

const prisma = new PrismaClient();

interface RetrieveLedgerOptions {
  companyIdentifier: string;
  accountIds: string[];
  startDate: Date;
  endDate: Date;
}

export async function retrieveLedgerEntries({
  companyIdentifier,
  accountIds,
  startDate,
  endDate,
}: RetrieveLedgerOptions) {
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

    if (!companyId) {
      return {
        success: false,
        message: "Bad request",
      };
    }

    // 1. Get entries in selected range
    const entries = await prisma.ledgerEntry.findMany({
      where: {
        ledgerTransaction: {
          isDeleted: false,
          companyId,
        },
        isDeleted: false,
        coaId: {
          in: accountIds,
        },
        fsDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        coa: { select: { accountCode: true, accountName: true } },
        sourceCurrency: { select: { code: true, symbol: true, name: true } },
      },
      omit: {
        isDeleted: true,
        deletedAt: true,
      },
      orderBy: [{ fsDate: "asc" }, { createdAt: "asc" }],
    });

    // Get opening balances
    const openingBalances = await prisma.ledgerEntry.findMany({
      where: {
        ledgerTransaction: {
          isDeleted: false,
          companyId,
        },
        isDeleted: false,
        coaId: {
          in: accountIds,
        },
        fsDate: {
          lt: startDate,
        },
      },
      include: {
        coa: {
          select: { fsKey: true, defaultSide: true, company: { select: {} } },
        },
      },
      select: {
        coaId: true,
        amount: true,
        transactionSide: true,
      },
    });
  } catch (error) {}
}
