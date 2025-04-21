import {
  CategorisationStatus,
  DebitCredit,
  PrismaClient,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

interface AccountTransaction {
  companyId: string;
  bankTransactionId?: string;
  date: Date;
  transactionSide: DebitCredit;
  sourceCurrencyId: string;
  sourceAmount: Decimal;
  systemExchangeRate: Decimal;
  customExchangeRate: Decimal;
  amount: Decimal;
  debitAccountId: string;
  creditAccountId: string;
  categorisationStatus: CategorisationStatus;
  categorisedAt: Date;
  categorisedById: string;
  createdById: string;
  contactId?: string;
  description?: string;
  source?: string;
  reference?: string;
  projectId?: string;
  notes?: string;
  updatedById?: string;
}

export async function createAccountTransactions(
  transactions: AccountTransaction[]
) {
  try {
    const result = await prisma.accountTransaction.createMany({
      data: transactions,
      skipDuplicates: true,
    });

    return {
      success: true,
      message: `${result.count} rows processed. Duplicates skipped.`,
    };
  } catch (error) {
    console.error("Error creating account transactions:", error);
    return {
      success: false,
      message: "Failed to create account transactions",
      error,
    };
  }
}
