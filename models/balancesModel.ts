import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { getIdentifierType } from "../utils/utils";
import { fetchExchangeRate } from "./exRateModel";

export async function coaAccountBalances(
  tx: Prisma.TransactionClient,
  companyIdentifier: string
) {
  try {
    const companyIdType = getIdentifierType(companyIdentifier);

    if (companyIdType !== "uuid" && companyIdType !== "shortCode") {
      console.error("Invalid company identifier type:", companyIdType);
      throw new Error("Invalid company identifier type");
    }

    const coaBalances = await tx.ledgerEntry.groupBy({
      by: ["coaId"],
      _sum: { amount: true },
      where: {
        coa: {
          ...(companyIdType === "uuid"
            ? { companyId: companyIdentifier }
            : { company: { shortCode: companyIdentifier } }),
          isDeleted: false,
        },
        isDeleted: false,
      },
    });

    return coaBalances.reduce(
      (acc, { coaId, _sum }) => {
        acc[coaId] = _sum.amount ? new Decimal(_sum.amount) : new Decimal(0);
        return acc;
      },
      {} as Record<string, Decimal>
    );
  } catch (error) {
    console.error("Error fetching COA account balances:", error);
    throw error;
  }
}

export async function getBankAccountBalances(
  tx: Prisma.TransactionClient,
  companyIdentifier: string
) {
  try {
    const companyIdType = getIdentifierType(companyIdentifier);

    if (companyIdType !== "uuid" && companyIdType !== "shortCode") {
      console.error("Invalid company identifier type:", companyIdType);
      throw new Error("Invalid company identifier type");
    }

    // Fetch bank account balances (it's in bank native currency by default)
    // Fetch bankAccounts and their currencies, in parrallel
    const [bankBalances, bankAccounts] = await Promise.all([
      tx.bankTransaction.groupBy({
        by: ["bankAccountId"],
        _sum: { amount: true },
        where: {
          bankAccount: {
            ...(companyIdType === "uuid"
              ? { companyId: companyIdentifier }
              : { company: { shortCode: companyIdentifier } }),
            isDeleted: false,
          },
          isDeleted: false,
        },
      }),

      tx.bankAccount.findMany({
        where: {
          ...(companyIdType === "uuid"
            ? { companyId: companyIdentifier }
            : { company: { shortCode: companyIdentifier } }),
          isDeleted: false,
        },
        select: {
          id: true,
          currencyId: true,
          company: { select: { reportingCurrencyId: true } },
        },
      }),
    ]);

    const balanceMap: Record<
      string,
      { reportingBalance: Decimal; nativeBalance: Decimal }
    > = {};

    const exchangeRateCache = new Map<string, Decimal>();

    for (const bankAccount of bankAccounts) {
      const { id: bankId, currencyId, company } = bankAccount;
      const reportingCurrencyId = company?.reportingCurrencyId;

      if (!reportingCurrencyId) {
        console.error(`No reporting currency found for company`);
        continue;
      }

      const nativeBalance = new Decimal(
        bankBalances.find((b) => b.bankAccountId === bankId)?._sum.amount ?? 0
      );

      let reportingBalance = nativeBalance;

      if (reportingCurrencyId !== currencyId) {
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

export async function getBankLedgerBalances(
  tx: Prisma.TransactionClient,
  companyIdentifier: string
) {
  try {
    const companyIdType = getIdentifierType(companyIdentifier);

    if (companyIdType !== "uuid" && companyIdType !== "shortCode") {
      console.error("Invalid company identifier type:", companyIdType);
      throw new Error("Invalid company identifier type");
    }

    const bankBalances = await tx.ledgerEntry.groupBy({
      by: ["coaId"],
      _sum: { amount: true, sourceAmount: true },
      where: {
        coa: {
          ...(companyIdType === "uuid"
            ? { companyId: companyIdentifier }
            : { company: { shortCode: companyIdentifier } }),
          accountType: {
            typeName: "Bank",
          },
          isDeleted: false,
        },
        isDeleted: false,
      },
    });

    return bankBalances.reduce(
      (acc, { coaId, _sum }) => {
        const reportingBalance = _sum.amount
          ? new Decimal(_sum.amount)
          : new Decimal(0);

        const nativeBalance = _sum.sourceAmount
          ? new Decimal(_sum.sourceAmount)
          : new Decimal(0);

        acc[coaId] = {
          reportingBalance,
          nativeBalance,
        };

        return acc;
      },
      {} as Record<
        string,
        { reportingBalance: Decimal; nativeBalance: Decimal }
      >
    );
  } catch (error) {
    console.error("Error fetching bank account balances:", error);
    throw error;
  }
}
