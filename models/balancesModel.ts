import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { getIdentifierType } from "../utils/utils";

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
