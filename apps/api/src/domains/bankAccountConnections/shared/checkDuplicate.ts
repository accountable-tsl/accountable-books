import type { Knex } from "knex";
import { type BankAccountConnectionStatus } from "../baccons.types.js";

export const checkForDuplicate = async ({
  providerId,
  providerUniqueBankAccountId,
  status,
  pruneStates = [],
  trx,
}: {
  providerId: string;
  providerUniqueBankAccountId: string;
  status?: BankAccountConnectionStatus[];
  pruneStates?: Exclude<BankAccountConnectionStatus, "active">[];
  trx: Knex.Transaction;
}): Promise<{
  exists: boolean;
  connection?: {
    id: string;
    status?: BankAccountConnectionStatus;
    bankAccountId?: string;
  };
  pruned?: boolean;
}> => {
  try {
    const query = trx("bank_account_connections")
      .select("id", "status", "bank_account_id")
      .where({
        provider_bank_account_id: providerUniqueBankAccountId,
        provider_id: providerId,
      });

    // Only filter by status if explicitly provided
    if (status?.length) {
      query.whereIn("status", status);
    }

    const connection = await query.first();

    // Hard delete if requested and status matches
    let pruned = false;
    if (
      connection?.status &&
      connection.status !== "active" &&
      pruneStates.includes(connection.status)
    ) {
      await trx("bank_account_connections")
        .where({ id: connection.id })
        .delete();

      pruned = true;
    }

    return {
      exists: !!connection && !pruned,
      connection:
        connection && !pruned
          ? {
              id: connection.id,
              status: connection.status,
              ...(connection?.bank_account_id
                ? { bankAccountId: connection?.bank_account_id }
                : {}),
            }
          : undefined,
      pruned,
    };
  } catch (error: any) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    if (typeof error === "string") {
      throw new Error(error);
    }
    throw new Error("Unknown error");
  }
};
