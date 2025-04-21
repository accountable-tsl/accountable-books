import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { getIdentifierType } from "../utils/utils-old";
import { fetchExchangeRate } from "./exRateModel";
import type { Knex } from "knex";
import knexInstance from "../knexClient";

type RawCoaBalanceRow = {
  coaId: string;
  sumAmount: string | number | null;
};
// export async function coaAccountBalances(
//   tx: Prisma.TransactionClient,
//   companyIdentifier: string
// ) {
//   try {
//     const companyIdType = getIdentifierType(companyIdentifier);

//     if (companyIdType !== "uuid" && companyIdType !== "shortCode") {
//       console.error("Invalid company identifier type:", companyIdType);
//       throw new Error("Invalid company identifier type");
//     }

//     const coaBalances = await tx.ledgerEntry.groupBy({
//       by: ["coaId"],
//       _sum: { amount: true },
//       where: {
//         coa: {
//           ...(companyIdType === "uuid"
//             ? { companyId: companyIdentifier }
//             : { company: { shortCode: companyIdentifier } }),
//           isDeleted: false,
//         },
//         isDeleted: false,
//       },
//     });

//     return coaBalances.reduce(
//       (acc, { coaId, _sum }) => {
//         acc[coaId] = _sum.amount ? new Decimal(_sum.amount) : new Decimal(0);
//         return acc;
//       },
//       {} as Record<string, Decimal>
//     );
//   } catch (error) {
//     console.error("Error fetching COA account balances:", error);
//     throw error;
//   }
// }

// export async function getBankAccountBalances(
//   tx: Prisma.TransactionClient,
//   companyIdentifier: string
// ) {
//   try {
//     const companyIdType = getIdentifierType(companyIdentifier);

//     if (companyIdType !== "uuid" && companyIdType !== "shortCode") {
//       console.error("Invalid company identifier type:", companyIdType);
//       throw new Error("Invalid company identifier type");
//     }

//     // Fetch bank account balances (it's in bank native currency by default)
//     // Fetch bankAccounts and their currencies, in parrallel
//     const [bankBalances, bankAccounts] = await Promise.all([
//       tx.bankTransaction.groupBy({
//         by: ["bankAccountId"],
//         _sum: { amount: true },
//         where: {
//           bankAccount: {
//             ...(companyIdType === "uuid"
//               ? { companyId: companyIdentifier }
//               : { company: { shortCode: companyIdentifier } }),
//             isDeleted: false,
//           },
//           isDeleted: false,
//         },
//       }),

//       tx.bankAccount.findMany({
//         where: {
//           ...(companyIdType === "uuid"
//             ? { companyId: companyIdentifier }
//             : { company: { shortCode: companyIdentifier } }),
//           isDeleted: false,
//         },
//         select: {
//           id: true,
//           currencyId: true,
//           company: { select: { reportingCurrencyId: true } },
//         },
//       }),
//     ]);

//     const balanceMap: Record<
//       string,
//       { reportingBalance: Decimal; nativeBalance: Decimal }
//     > = {};

//     const exchangeRateCache = new Map<string, Decimal>();

//     for (const bankAccount of bankAccounts) {
//       const { id: bankId, currencyId, company } = bankAccount;
//       const reportingCurrencyId = company?.reportingCurrencyId;

//       if (!reportingCurrencyId) {
//         console.error(`No reporting currency found for company`);
//         continue;
//       }

//       const nativeBalance = new Decimal(
//         bankBalances.find((b) => b.bankAccountId === bankId)?._sum.amount ?? 0
//       );

//       let reportingBalance = nativeBalance;

//       if (reportingCurrencyId !== currencyId) {
//         const cacheKey = `${currencyId}-${reportingCurrencyId}`;

//         if (!exchangeRateCache.has(cacheKey)) {
//           const exchangeRateResult = await fetchExchangeRate(
//             new Date(),
//             currencyId,
//             reportingCurrencyId
//           );

//           if (exchangeRateResult.success && exchangeRateResult.data?.rate) {
//             exchangeRateCache.set(
//               cacheKey,
//               new Decimal(exchangeRateResult.data.rate)
//             );
//           } else {
//             console.error(
//               `Exchange rate fetch failed for ${currencyId} to ${reportingCurrencyId} on ${new Date().toLocaleDateString()}`
//             );
//           }
//         }

//         const exchangeRate = exchangeRateCache.get(cacheKey);
//         if (exchangeRate) {
//           reportingBalance = nativeBalance.times(exchangeRate);
//         }
//       }

//       balanceMap[bankId] = {
//         reportingBalance,
//         nativeBalance,
//       };
//     }

//     return balanceMap;
//   } catch (error) {
//     console.error("Error fetching bank account balances:", error);
//     throw error;
//   }
// }

export async function coaAccountBalances(companyIdentifier: string) {
  try {
    const companyIdType = getIdentifierType(companyIdentifier);

    if (companyIdType !== "uuid" && companyIdType !== "shortCode") {
      throw new Error("Invalid company identifier type");
    }

    const coaBalances: RawCoaBalanceRow[] = await knexInstance("LedgerEntry")
      .join("Coa", "LedgerEntry.coaId", "Coa.id")
      .modify((qb) => {
        if (companyIdType === "uuid") {
          qb.where("Coa.companyId", companyIdentifier);
        } else {
          qb.join("Company", "Coa.companyId", "Company.id").where(
            "Company.shortCode",
            companyIdentifier
          );
        }
      })
      .where("LedgerEntry.isDeleted", false)
      .where("Coa.isDeleted", false)
      .groupBy("LedgerEntry.coaId")
      .select("LedgerEntry.coaId")
      .sum("LedgerEntry.amount as sumAmount");

    return coaBalances.reduce(
      (acc: Record<string, Decimal>, row) => {
        acc[row.coaId] = new Decimal(row.sumAmount ?? 0);
        return acc;
      },
      {} as Record<string, Decimal>
    );
  } catch (error) {
    console.error("Error fetching COA account balances:", error);
    throw error;
  }
}

export async function getBankAccountBalances(companyIdentifier: string) {
  try {
    const companyIdType = getIdentifierType(companyIdentifier);

    if (companyIdType !== "uuid" && companyIdType !== "shortCode") {
      console.error("Invalid company identifier type:", companyIdType);
      throw new Error("Invalid company identifier type");
    }

    // // Helper for conditional company filtering
    // const companyFilter = (query: Knex.QueryBuilder, table: string) => {
    //   if (companyIdType === "uuid") {
    //     query.where(`${table}.companyId`, companyIdentifier);
    //   } else {
    //     query
    //       .join("Company", `${table}.companyId`, "Company.id")
    //       .where("Company.shortCode", companyIdentifier);
    //   }
    //   return query;
    // };

    // 1. Get Bank Balances (Native Currency)
    const bankBalancesQuery = knexInstance("BankTransaction")
      .select("BankTransaction.bankAccountId")
      .sum("BankTransaction.amount as totalAmount")
      .where("BankTransaction.isDeleted", false)
      .join("BankAccount", "BankTransaction.bankAccountId", "BankAccount.id")
      .where("BankAccount.isDeleted", false)
      .groupBy("BankTransaction.bankAccountId");

    if (companyIdType === "uuid") {
      bankBalancesQuery.where("BankAccount.companyId", companyIdentifier);
    } else {
      bankBalancesQuery
        .join("Company", "BankAccount.companyId", "Company.id")
        .where("Company.shortCode", companyIdentifier);
    }

    // 2. Get Bank Accounts with Currencies
    const bankAccountsQuery = knexInstance("BankAccount")
      .select([
        "BankAccount.id as bankId",
        "BankAccount.currencyId",
        "Company.reportingCurrencyId",
      ])
      .where("BankAccount.isDeleted", false)
      .leftJoin("Company", "BankAccount.companyId", "Company.id");

    if (companyIdType === "uuid") {
      bankAccountsQuery.where("BankAccount.companyId", companyIdentifier);
    } else {
      bankAccountsQuery.where("Company.shortCode", companyIdentifier);
    }

    const [bankBalances, bankAccounts] = await Promise.all([
      bankBalancesQuery,
      bankAccountsQuery,
    ]);

    const balanceMap: Record<
      string,
      { reportingBalance: Decimal; nativeBalance: Decimal }
    > = {};

    const exchangeRateCache = new Map<string, Decimal>();

    for (const bankAccount of bankAccounts) {
      const { bankId, currencyId, reportingCurrencyId } = bankAccount;

      if (!reportingCurrencyId) {
        console.error(`No reporting currency for bank ${bankId}`);
        continue;
      }

      // Find matching balance
      const balance = bankBalances.find((b) => b.bankAccountId === bankId);
      const nativeBalance = new Decimal(balance?.totalAmount || 0);

      let reportingBalance = nativeBalance;

      if (currencyId !== reportingCurrencyId) {
        const cacheKey = `${currencyId}-${reportingCurrencyId}`;

        if (!exchangeRateCache.has(cacheKey)) {
          try {
            const rateResult = await fetchExchangeRate(
              new Date(),
              currencyId,
              reportingCurrencyId
            );

            if (rateResult.success && rateResult.data?.rate) {
              exchangeRateCache.set(
                cacheKey,
                new Decimal(rateResult.data.rate)
              );
            }
          } catch (error) {
            console.error(`Exchange rate fetch failed: ${cacheKey}`, error);
          }
        }

        const rate = exchangeRateCache.get(cacheKey);
        if (rate) reportingBalance = nativeBalance.times(rate);
      }

      balanceMap[bankId] = { reportingBalance, nativeBalance };
    }

    return balanceMap;
  } catch (error) {
    console.error("Error fetching bank account balances:", error);
    throw error;
  }
}

// export async function getBankLedgerBalances(
//   tx: Prisma.TransactionClient,
//   companyIdentifier: string
// ) {
//   try {
//     const companyIdType = getIdentifierType(companyIdentifier);

//     if (companyIdType !== "uuid" && companyIdType !== "shortCode") {
//       console.error("Invalid company identifier type:", companyIdType);
//       throw new Error("Invalid company identifier type");
//     }

//     const bankBalances = await tx.ledgerEntry.groupBy({
//       by: ["coaId"],
//       _sum: { amount: true, sourceAmount: true },
//       where: {
//         coa: {
//           ...(companyIdType === "uuid"
//             ? { companyId: companyIdentifier }
//             : { company: { shortCode: companyIdentifier } }),
//           accountType: {
//             typeName: "Bank",
//           },
//           isDeleted: false,
//         },
//         isDeleted: false,
//       },
//     });

//     return bankBalances.reduce(
//       (acc, { coaId, _sum }) => {
//         const reportingBalance = _sum.amount
//           ? new Decimal(_sum.amount)
//           : new Decimal(0);

//         const nativeBalance = _sum.sourceAmount
//           ? new Decimal(_sum.sourceAmount)
//           : new Decimal(0);

//         acc[coaId] = {
//           reportingBalance,
//           nativeBalance,
//         };

//         return acc;
//       },
//       {} as Record<
//         string,
//         { reportingBalance: Decimal; nativeBalance: Decimal }
//       >
//     );
//   } catch (error) {
//     console.error("Error fetching bank account balances:", error);
//     throw error;
//   }
// }

export async function getBankLedgerBalances(companyIdentifier: string) {
  try {
    const companyIdType = getIdentifierType(companyIdentifier);

    if (companyIdType !== "uuid" && companyIdType !== "shortCode") {
      throw new Error("Invalid company identifier type");
    }

    const ledgerBalancesQuery = knexInstance("LedgerEntry")
      .select("LedgerEntry.coaId")
      .sum({ totalAmount: "LedgerEntry.amount" })
      .sum({ totalSourceAmount: "LedgerEntry.sourceAmount" })
      .where("LedgerEntry.isDeleted", false)
      // Join with Coa to apply filters on the associated chart of accounts.
      .join("Coa", "LedgerEntry.coaId", "Coa.id")
      .where("Coa.isDeleted", false)
      // Join with AccountType to filter for Bank type accounts.
      .join("AccountType", "Coa.accountTypeId", "AccountType.id")
      .where("AccountType.typeName", "Bank");

    if (companyIdType === "uuid") {
      ledgerBalancesQuery.where("Coa.companyId", companyIdentifier);
    } else {
      ledgerBalancesQuery
        .join("Company", "Coa.companyId", "Company.id")
        .where("Company.shortCode", companyIdentifier);
    }

    ledgerBalancesQuery.groupBy("LedgerEntry.coaId");

    const bankBalances = await ledgerBalancesQuery;

    // Process the results into the expected output format.
    const balanceMap: Record<
      string,
      { reportingBalance: Decimal; nativeBalance: Decimal }
    > = {};

    bankBalances.forEach((row: any) => {
      const coaId = row.coaId;
      const reportingBalance = row.totalAmount
        ? new Decimal(row.totalAmount)
        : new Decimal(0);
      const nativeBalance = row.totalSourceAmount
        ? new Decimal(row.totalSourceAmount)
        : new Decimal(0);
      balanceMap[coaId] = { reportingBalance, nativeBalance };
    });

    return balanceMap;
  } catch (error) {
    console.error("Error fetching bank ledger balances:", error);
    throw error;
  }
}
