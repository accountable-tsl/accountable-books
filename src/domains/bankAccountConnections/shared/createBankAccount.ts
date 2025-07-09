

import type { Knex } from "knex";
import { MonoAccountDetails } from "../baccons.types";
import { getCurrencyByCode } from "../../currencies/currencies.model";
import { knexClient } from "../../../../knexClient";
import { createNewBankAccount } from "../../bankAccounts/bankAccounts.model";
import { AppError } from "../../../shared/utils/response.utils";
import { resolveBankFromMonoDetails } from "./resolveBank";
import { resolveCurrency } from "./resolveCurrency";

export async function createBankAccount({
  userId,
  companyId,
  accountName,
  accountNumber,
  bankId,
  currencyId,
  trx,
}: {
  userId: string;
  companyId: string;
  accountName: string;
  accountNumber: string;
  bankId: string;
  currencyId: string;
  trx?: Knex.Transaction;
}) {
  const execute = async (knex: Knex.Transaction) => {
    // Create bank account
    const result = await createNewBankAccount({
      companyId,
      userId,
      data: {
        displayName: accountName,
        accountName: accountName,
        accountNumber: accountNumber,
        bankId,
        currencyId,
      },
      trx,
    });

    if (!result.success) {
      throw new Error(result.message || "Bank account creation failed");
    }

    return {
      success: true,
      bankAccountId: result.data?.id,
    };
  };

  try {
    return trx ? await execute(trx) : await knexClient.transaction(execute);
  } catch (err: any) {
    throw new AppError(
      err instanceof Error ? err.message : "Bank account creation failed",
      {
        companyId,
        accountName,
      }
    );
  }
}
