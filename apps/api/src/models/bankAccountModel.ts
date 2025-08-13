import { CategorisationStatus, PrismaClient } from "@prisma/client";
import { createCOAModel } from "./coaModel";
import { BankAccountType } from "@prisma/client/wasm";
import { getIdentifierType } from "../utils/utils-old";
import { getBankAccountBalances, getBankLedgerBalances } from "./balancesModel";
import { Decimal } from "@prisma/client/runtime/library";
import { knexClient } from "../knexClient";

const prisma = new PrismaClient();

export async function getAllBankAccounts(companyId: string) {
  try {
    // Determine company identifier type
    const idType = getIdentifierType(companyId);
    // const companyIdReceived = companyId;

    const bankAccounts = await prisma.bankAccount.findMany({
      where:
        idType === "uuid"
          ? { companyId }
          : { company: { shortCode: companyId } },
      include: {
        bank: true,
        currency: true,
        accountInCoa: {
          select: {
            id: true,
            accountCode: true,
            currency: { select: { code: true, symbol: true } },
          },
        },
      },
    });

    if (bankAccounts.length === 0) {
      return {
        success: false,
        message: "No bank accounts found",
        data: {},
      };
    }

    // Fetch related financial data in parallel
    const [bankAccountBalances, bankLedgerBalances] = await Promise.all([
      getBankAccountBalances(companyId),
      getBankLedgerBalances(companyId),
    ]);

    // Get transaction statistics
    // const transactionCounts = await prisma.bankTransaction.groupBy({
    //   by: ["bankAccountId", "categorisationStatus"],
    //   _count: true,
    //   where: { bankAccountId: { in: bankAccounts.map((acc) => acc.id) } },
    // });

    const transactionCounts = await knexInstance("BankTransaction")
      .select("bankAccountId", "categorisationStatus")
      .whereIn(
        "bankAccountId",
        bankAccounts.map((acc) => acc.id)
      )
      .groupBy("bankAccountId", "categorisationStatus")
      .count("* as _count");

    // Transaction statistics mapping
    let totalUncategorisedTransactions = 0;
    let totalAutoCategorisedTransactions = 0;
    let totalCategorisedTransactions = 0;

    const bankTransactionStats = transactionCounts.reduce(
      (stats, row) => {
        const { bankAccountId, categorisationStatus, _count } = row;
        if (!stats[bankAccountId]) {
          stats[bankAccountId] = {
            total: 0,
            uncategorised: 0,
            categorised: 0,
            autoCategorised: 0,
          };
        }
        stats[bankAccountId].total += Number(_count);
        if (categorisationStatus === CategorisationStatus.UNCATEGORISED)
          stats[bankAccountId].uncategorised += Number(_count);

        if (categorisationStatus === CategorisationStatus.CATEGORISED)
          stats[bankAccountId].categorised += Number(_count);

        if (categorisationStatus === CategorisationStatus.AUTO_CATEGORISED)
          stats[bankAccountId].autoCategorised += Number(_count);

        return stats;
      },
      {} as Record<
        string,
        {
          total: number;
          uncategorised: number;
          categorised: number;
          autoCategorised: number;
        }
      >
    );

    // Compute metadata variables
    let totalBankLedgerReportingBalance = new Decimal(0);
    let totalBankAccountReportingBalance = new Decimal(0);
    let bankAccountsWithUncategorisedTransactions = 0;
    let bankAccountsWithAutoCategorisedTransactions = 0;

    const enrichedBankAccounts = bankAccounts.map((account) => {
      const coaAccountId = account.accountInCoa?.id;
      const bankLedgerNativeBalance =
        bankLedgerBalances[coaAccountId]?.nativeBalance || new Decimal(0);
      const bankLedgerReportingBalance =
        bankLedgerBalances[coaAccountId]?.reportingBalance || new Decimal(0);

      const bankAccountNativeBalance =
        bankAccountBalances[account.id].nativeBalance;
      const bankAccountReportingBalance =
        bankAccountBalances[account.id].reportingBalance;

      // Accumulate total balances
      totalBankLedgerReportingBalance = totalBankLedgerReportingBalance.plus(
        bankLedgerReportingBalance
      );
      totalBankAccountReportingBalance = totalBankAccountReportingBalance.plus(
        bankAccountReportingBalance
      );

      if (bankTransactionStats[account.id]?.uncategorised > 0) {
        bankAccountsWithUncategorisedTransactions++;
      }
      if (bankTransactionStats[account.id]?.autoCategorised > 0) {
        bankAccountsWithAutoCategorisedTransactions++;
      }

      return {
        ...account,
        accountInCoa: account.accountInCoa
          ? {
              ...account.accountInCoa,
              nativeBalance: bankLedgerNativeBalance,
              reportingBalance: bankLedgerReportingBalance,
            }
          : {},
        bankBalance: bankAccountNativeBalance,
        ...(bankTransactionStats[account.id]
          ? {
              totalTransactionCount:
                bankTransactionStats[account.id].total || 0,
              uncategorisedCount:
                bankTransactionStats[account.id].uncategorised || 0,
              categorisedCount:
                bankTransactionStats[account.id].categorised || 0,
              autoCategorisedCount:
                bankTransactionStats[account.id].autoCategorised || 0,
            }
          : {}),
      };
    });

    return {
      success: true,
      message: "Successfully retrieved all bank accounts",
      data: {
        bankAccounts: enrichedBankAccounts,
        metadata: {
          totalBankAccounts: bankAccounts.length,

          totalBankBalance: totalBankAccountReportingBalance,
          totalLedgerBalance: totalBankLedgerReportingBalance,

          bankAccountsWithUncategorisedTransactions,
          bankAccountsWithAutoCategorisedTransactions,

          totalUncategorisedTransactions,
          totalAutoCategorisedTransactions,
          totalCategorisedTransactions,
          totalTransactions:
            totalUncategorisedTransactions +
            totalAutoCategorisedTransactions +
            totalCategorisedTransactions,
        },
      },
    };
  } catch (error: any) {
    console.error(error);
    return {
      success: false,
      message: "An unexpected error occured",
    };
  }
}

export async function getSingleBankAccount(companyId: string, id: string) {
  try {
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { companyId, id },
      include: { bank: true, currency: true },
    });

    if (!bankAccount) {
      return {
        success: false,
        message: "Bank account not found",
      };
    }

    return {
      success: true,
      message: "Successfully retrieved the bank account",
      data: { bankAccount },
    };
  } catch (error: any) {
    console.error(error.message || error);
    return {
      success: false,
      message: "An unexpected error occurred",
    };
  }
}

export interface CreateBankData {
  bankId: string;
  displayName: string;
  bankAccountType: BankAccountType;
  bankAccountNo: string;
  currencyId: string;
}

// export async function createNewBankAccount(
//   companyId: string,
//   data: CreateBankData
// ) {
//   try {
//     const companyIdType = getIdentifierType(companyId);

//     const company = await prisma.company.findFirst({
//       where:
//         companyIdType === "uuid" ? { id: companyId } : { shortCode: companyId },
//       select: { id: true },
//     });

//     if (!company) {
//       return {
//         success: false,
//         message: "Unauthorized access",
//       };
//     }

//     const [bank, currency] = await Promise.all([
//       prisma.bank.findUnique({ where: { id: data.bankId } }),
//       prisma.currency.findUnique({ where: { id: data.currencyId } }),
//     ]);

//     if (!bank) {
//       return {
//         success: false,
//         message: "BankId incorrect",
//       };
//     }

//     if (!currency) {
//       return {
//         success: false,
//         message: "Currency not found",
//       };
//     }

//     const existingBankAccount = await prisma.bankAccount.findFirst({
//       where: {
//         bankId: data.bankId,
//         bankAccountNo: data.bankAccountNo,
//         companyId: company.id,
//       },
//     });

//     if (existingBankAccount) {
//       return {
//         success: false,
//         message: "Bank account number already exists",
//       };
//     }

//     let coaId;

//     const coaInput = {
//       accountName: data.displayName,
//       accountTypeName: "Bank",
//     };

//     const result = await prisma.$transaction(async (tx) => {
//       //Create COA entry
//       const coa = await createCOAModel(tx, company.id, coaInput);

//       if (coa.success && "data" in coa && coa.data?.id) {
//         coaId = coa.data.id;
//       } else {
//         return coa;
//       }

//       //Create new bank account
//       const newBankAccount = await tx.bankAccount.create({
//         data: {
//           companyId: company.id,
//           bankId: data.bankId,
//           displayName: data.displayName,
//           bankAccountType: data.bankAccountType,
//           bankAccountNo: data.bankAccountNo,
//           currencyId: data.currencyId,
//           coaId: coaId,
//           updatedAt: new Date(),
//         },
//       });

//       //Update COA with Bank Account ID
//       await tx.coa.update({
//         where: { id: coaId },
//         data: { bankAccountId: newBankAccount.id },
//       });

//       return {
//         success: true,
//         message: "Bank account created successfully",
//         data: newBankAccount,
//       };
//     });

//     return result;
//   } catch (error: unknown) {
//     console.error("Error creating bank account:", error);
//     return {
//       success: false,
//       message: "Failed to create bank account",
//     };
//   }
// }

// For bank transaction uploads, remember to check that the transaction did not exist before allowing new upload
