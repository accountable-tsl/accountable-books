import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { getIdentifierType } from "../utils/utils";
import { fetchExchangeRate } from "./exRateModel";
import type { Knex } from "knex";
import knexInstance from "../knexClient";

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

    const balances = await knexInstance("ledger_entries")
      .select("coa_id")
      .sum({ amount: "amount" })
      .join("coas", "ledger_entries.coa_id", "coas.id")
      .modify((qb) => {
        if (companyIdType === "uuid") {
          qb.where("coas.company_id", companyIdentifier);
        } else {
          qb.join("companies", "coas.company_id", "companies.id").where(
            "companies.short_code",
            companyIdentifier
          );
        }
      })
      .where("coas.is_deleted", false)
      .andWhere("ledger_entries.is_deleted", false)
      .groupBy("coa_id");

    return balances.reduce(
      (
        acc: Record<string, Decimal>,
        row: { coa_id: string; amount: number | null }
      ) => {
        acc[row.coa_id] = new Decimal(row.amount || 0);
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

    const baseQuery = knexInstance("bank_transactions")
      .where("bank_transactions.is_deleted", false)
      .join(
        "bank_accounts",
        "bank_transactions.bank_account_id",
        "bank_accounts.id"
      )
      .where("bank_accounts.is_deleted", false);

    if (companyIdType === "uuid") {
      baseQuery.andWhere("bank_accounts.company_id", companyIdentifier);
    } else {
      baseQuery
        .join("companies", "bank_accounts.company_id", "companies.id")
        .andWhere("companies.short_code", companyIdentifier);
    }

    const bankBalancesRaw = await baseQuery
      .select("bank_transactions.bank_account_id")
      .sum("bank_transactions.amount as sum")
      .groupBy("bank_transactions.bank_account_id");

    const bankAccounts = await knexInstance("bank_accounts")
      .select(
        "bank_accounts.id",
        "bank_accounts.currency_id",
        "companies.reporting_currency_id"
      )
      .join("companies", "bank_accounts.company_id", "companies.id")
      .where("bank_accounts.is_deleted", false)
      .modify((query) => {
        if (companyIdType === "uuid") {
          query.andWhere("bank_accounts.company_id", companyIdentifier);
        } else {
          query.andWhere("companies.short_code", companyIdentifier);
        }
      });

    const balanceMap: Record<
      string,
      { reportingBalance: Decimal; nativeBalance: Decimal }
    > = {};
    const exchangeRateCache = new Map<string, Decimal>();

    for (const bankAccount of bankAccounts) {
      const {
        id: bankId,
        currency_id: currencyId,
        reporting_currency_id: reportingCurrencyId,
      } = bankAccount;

      const balanceRaw = bankBalancesRaw.find(
        (b) => b.bank_account_id === bankId
      );
      const nativeBalance = new Decimal(balanceRaw?.sum || 0);

      let reportingBalance = nativeBalance;

      if (reportingCurrencyId && reportingCurrencyId !== currencyId) {
        const cacheKey = `${currencyId}-${reportingCurrencyId}`;

        if (!exchangeRateCache.has(cacheKey)) {
          const exchangeRateResult = await fetchExchangeRate(
            new Date(),
            currencyId,
            reportingCurrencyId
          );

          if (exchangeRateResult.success && exchangeRateResult.data?.rate) {
            exchangeRateCache.set(
              cacheKey,
              new Decimal(exchangeRateResult.data.rate)
            );
          } else {
            console.error(
              `Exchange rate fetch failed for ${currencyId} to ${reportingCurrencyId} on ${new Date().toLocaleDateString()}`
            );
          }
        }

        const exchangeRate = exchangeRateCache.get(cacheKey);
        if (exchangeRate) {
          reportingBalance = nativeBalance.times(exchangeRate);
        }
      }

      balanceMap[bankId] = {
        reportingBalance,
        nativeBalance,
      };
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

    const balances = await knexInstance("ledger_entries")
      .select("coa_id")
      .sum({ reportingBalance: "amount", nativeBalance: "source_amount" })
      .join("coas", "ledger_entries.coa_id", "coas.id")
      .join("account_types", "coas.account_type_id", "account_types.id")
      .modify((qb) => {
        if (companyIdType === "uuid") {
          qb.where("coas.company_id", companyIdentifier);
        } else {
          qb.join("companies", "coas.company_id", "companies.id").where(
            "companies.short_code",
            companyIdentifier
          );
        }
      })
      .where("account_types.type_name", "Bank")
      .andWhere("coas.is_deleted", false)
      .andWhere("ledger_entries.is_deleted", false)
      .groupBy("coa_id");

    return balances.reduce(
      (acc, row) => {
        acc[row.coa_id] = {
          reportingBalance: new Decimal(row.reportingBalance || 0),
          nativeBalance: new Decimal(row.nativeBalance || 0),
        };
        return acc;
      },
      {} as Record<
        string,
        { reportingBalance: Decimal; nativeBalance: Decimal }
      >
    );
  } catch (error) {
    console.error("Error fetching bank ledger balances:", error);
    throw error;
  }
}
