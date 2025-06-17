import type { Knex } from "knex";
import { getBankFeedProviders } from "../bankFeedProviders/bankFeedProviders.model";
import {
  AppError,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import axios from "axios";
import { ENV } from "../../config/env";
import { createNewBankAccount } from "../bankAccounts/bankAccounts.model";
import { knexClient } from "../../../knexClient";
import {
  bankAccountType,
  NewBankAccountInput,
} from "../bankAccounts/bankAccounts.types";
import { coaSource } from "../chartOfAccounts/coa.types";
import { ApiResponse } from "../../core/types/api.types";
import {
  BankAccountConnectionInput,
  bankAccountConnectionInputCamel,
  ConnectionResponse,
  CreateNewBankAccountConnection,
  MonoAccountDetails,
  MonoAccountErrorResponse,
  MonoAccountResponse,
  FuzzyMatch,
  BankAccountMatch,
  ConnectionStatus,
  UpdateBankAccountConnection,
  updateBankAccountConnectionCamel,
} from "./bankAccountConnections.types";
import { computeMatchScoreAndReasons } from "./bankAccountConnections.utils";

export const handleMonoConnection = async ({
  code,
  providerKey = "mono",
  userId,
  companyId,
  trx: providedTrx,
}: {
  code: string;
  providerKey?: string;
  userId: string;
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ connections: ConnectionResponse[] }>> => {
  const secretKey = ENV.MONO_SECRET_KEY;
  if (!secretKey) {
    if (providedTrx) await providedTrx.rollback();
    return errorResponse("Mono secret key is required", null, {
      report: true,
    });
  }
  // Remember to run relevant parts in a transaction whether passed in or not and make sure to not nest transactions
  let trx;

  try {
    // Start transaction
    trx = providedTrx || (await knexClient.transaction());
    /**
     * Steps 1-3: Data Acquisition
     * Exchange code → Get permanent ID
     * Fetch details → Get full account info
     * Check duplicates → Prevent re-connections
     */

    // Exchange code for permanent Mono ID
    const exchangeRes = await exchangeMonoCode({ code, secretKey });
    if (!exchangeRes.success || !exchangeRes.data) {
      if (!providedTrx && trx) await trx.rollback();
      return errorResponse("Failed to exchange Mono code", exchangeRes);
    }
    const permanentMonoId = exchangeRes.data.permanentMonoId;

    // Fetch full account details from Mono
    const monoAccountRes = await getMonoAccountDetails({
      accountId: permanentMonoId,
      secretKey,
    });
    if (!monoAccountRes.success || !monoAccountRes.data) {
      if (!providedTrx && trx) await trx.rollback();
      return errorResponse(
        "Failed to fetch Mono account details",
        monoAccountRes
      );
    }

    const jsonToSave = {
      id: monoAccountRes.data.id,
      name: monoAccountRes.data.name,
      currency: monoAccountRes.data.currency,
      account_number: monoAccountRes.data.account_number,
      bvn: monoAccountRes.data.bvn,
      institution: {
        name: monoAccountRes.data.institution.name,
        bank_code: monoAccountRes.data.institution.bank_code,
        type: monoAccountRes.data.institution.type,
      },
    };

    // Fetch mono id from bank_feed_providers table
    const monoProviderRes = await getBankFeedProviders({
      providerKeys: providerKey,
      useCache: false,
    });
    if (
      !monoProviderRes.success ||
      !monoProviderRes.data ||
      !monoProviderRes.data.length
    ) {
      if (!providedTrx && trx) await trx.rollback();
      return errorResponse("Mono provider not configured in system");
    }
    const monoProvider = monoProviderRes.data[0];
    const providerId = monoProvider.id;

    // Check for existing active connection
    const alreadyConnected = await checkExistingConnection({
      providerBankAccountId: permanentMonoId,
      providerId,
      status: ["active", "pending"], // check pending status to avoid re-attempts during processing
      trx,
    });
    if (alreadyConnected) {
      if (!providedTrx && trx) await trx.rollback();
      return errorResponse("Bank account already connected via Mono.", {
        code,
        providerBankAccountId: permanentMonoId,
        providerId,
      });
    }

    /**
     * Step 4: Data Safety
     * Save immediately with bank_account_id: null
     * No data loss risk - connection is preserved even if matching fails
     * Status: "pending" until processing completes
     */
    const newConnection: BankAccountConnectionInput = {
      providerBankAccountId: permanentMonoId,
      providerId,
      bankAccountId: null,
      status: "pending",
      rawMetadata: jsonToSave,
    };
    const newConnectionRes = await addBankAccountConnection({
      userId,
      data: newConnection,
      trx,
    });
    if (!newConnectionRes.success || !newConnectionRes.data?.id) {
      if (!providedTrx && trx) await trx.rollback();
      return errorResponse(
        "Could not save pending bank connection",
        newConnectionRes
      );
    }
    const connectionId = newConnectionRes.data.id;

    /**
     * Steps 5-6: Smart Matching
     * Find matches using your matching algorithm
     * Decide action based on match quality
     * Update connection with final bank account ID
     */

    const matchResult = await findBankAccountMatches({
      providerId,
      accountDetails: monoAccountRes.data,
      companyId,
    });

    let finalBankAccountId: string | null = null;
    let connStatus: ConnectionStatus = "connected";
    let userActionRequired = false;
    let responseMessage = "";

    if (matchResult.exactMatch) {
      // EXACT MATCH: Auto-connect
      finalBankAccountId = matchResult.exactMatch.bankAccountId;
      connStatus = "connected";
      responseMessage = "Connected automatically to existing account.";

      // Update the connection with the matched bank account
      await updateBankAccountConnection({
        connectionId,
        updates: {
          bankAccountId: finalBankAccountId,
          status: "active",
        },
        trx,
      });
    } else if (
      matchResult.fuzzyMatches.length > 0 ||
      matchResult.unconnectedAccounts.length > 0
    ) {
      // FUZZY MATCHES OR UNCONNECTED ACCOUNTS: Need user confirmation
      connStatus = "needs_user_confirmation";
      userActionRequired = true;
      responseMessage =
        "Please select which account this connection belongs to.";
    } else if (
      matchResult.other?.resolvedBankId &&
      matchResult.other?.resolvedCurrencyId
    ) {
      // NO MATCHES: Create new bank account
      const acc = monoAccountRes.data;
      const newBankAccount = await createNewBankAccount({
        companyId,
        userId,
        data: {
          displayName: acc.name,
          accountName: acc.name,
          accountNumber: acc.account_number.toString(),
          bankId: matchResult.other?.resolvedBankId,
          currencyId: matchResult.other?.resolvedCurrencyId,
        },
      });

      if (!newBankAccount.success || !newBankAccount.data) {
        if (!providedTrx && trx) await trx.rollback();
        return errorResponse(
          "Failed to create new bank account",
          newBankAccount,
          {
            report: true,
          }
        );
      }

      finalBankAccountId = newBankAccount.data.id;
      connStatus = "new_account_created";
      responseMessage = "New account created and connected automatically.";

      // Update the connection with the new bank account
      await updateBankAccountConnection({
        connectionId,
        updates: {
          bankAccountId: finalBankAccountId,
          status: "active",
        },
      });
    } else {
      // NO MATCHES AND NO RESOLVED BANK/CURRENCY: Cannot process
      connStatus = "error";
      responseMessage =
        "Unable to match or create account - bank or currency not supported.";

      await updateBankAccountConnection({
        connectionId,
        updates: {
          status: "error",
        },
      });
    }

    /**
     * Steps 7-8:
     * Build Response
     * Build suggestions for frontend display
     * Create response with all necessary data
     */

    const connectionResponse: ConnectionResponse = {
      connectionDetails: {
        connectionId,
        providerId,
        providerName: monoProvider.name,
        providerKey: monoProvider.key,

        providerBankAccountId: permanentMonoId,
        bankAccountId: finalBankAccountId,

        connectionStatus: connStatus,
      },

      suggestedBankAccountMatches: [
        ...matchResult.fuzzyMatches,
        ...matchResult.unconnectedAccounts,
      ],

      userActionRequired,
      message: responseMessage,
    };

    if (!providedTrx && trx) await trx.commit();

    return successResponse("Bank account processed successfully.", {
      connections: [connectionResponse],
    });
  } catch (error) {
    if (!providedTrx && trx) await trx.rollback();
    return errorResponse(
      "Unexpected error during bank connection process",
      error,
      { report: true }
    );
  }
};

const exchangeMonoCode = async ({
  code,
  secretKey,
}: {
  code: string;
  secretKey: string;
}): Promise<ApiResponse<{ permanentMonoId: string }>> => {
  if (!code || !secretKey)
    return errorResponse("Code and secret key are required");

  try {
    const exchangeRes = await axios.post(
      "https://api.withmono.com/v2/accounts/auth",
      { code },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const responseData = exchangeRes.data;
    const accountId = responseData?.data?.id;

    if (!accountId || responseData.status !== "successful") {
      return errorResponse("Mono API returned unexpected response structure", {
        // Log safe details for debugging
        status: responseData?.status,
        message: responseData?.message,
      });
    }

    return successResponse("Mono account Id fetched", {
      permanentMonoId: accountId,
    });
  } catch (error) {
    if (axios.isAxiosError(error) && !error.response?.data) {
      return errorResponse("Mono API returned empty error response", {
        statusCode: error.response?.status,
      });
    }

    if (axios.isAxiosError(error)) {
      return errorResponse(
        `Mono API request failed: ${error.response?.status || "No status code"}`,
        {
          statusCode: error.response?.status,
          errorCode: error.response?.data?.error?.code || "UNKNOWN",
        }
      );
    }

    return errorResponse("Unexpected error during Mono API request", {
      error: (error as Error).message,
    });
  }
};

const checkExistingConnection = async ({
  providerBankAccountId,
  providerId,
  status = ["active"],
  trx,
}: {
  providerBankAccountId: string;
  providerId: string;
  status?: string[];
  trx?: Knex.Transaction;
}) => {
  const knex = trx || knexClient;
  const connection = await knex("bank_account_connections")
    .where({
      provider_bank_account_id: providerBankAccountId,
      provider_id: providerId,
    })
    .whereIn("status", status)
    .first();
  return !!connection;
};

const getMonoAccountDetails = async ({
  accountId,
  secretKey,
}: {
  accountId: string;
  secretKey: string;
}): Promise<ApiResponse<MonoAccountDetails>> => {
  if (!accountId || !secretKey) {
    return errorResponse("Account ID and secret key are required");
  }
  try {
    const response = await axios.get<MonoAccountResponse>(
      `https://api.withmono.com/v2/accounts/${accountId}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          Accept: "application/json",
        },
        timeout: 10000,
      }
    );

    const responseData = response.data;

    if (responseData.status === "failed") {
      return errorResponse(
        responseData.message || "Failed to fetch account details",
        { statusCode: response.status }
      );
    }

    // Validate successful response structure
    if (
      responseData.status !== "successful" ||
      !responseData.data?.account?.id
    ) {
      return errorResponse(
        "Mono API returned unexpected account details structure",
        {
          status: responseData.status,
          message: responseData.message,
        }
      );
    }

    return successResponse(
      "Account details fetched successfully",
      responseData.data.account
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Check for API error response with structure
      if (
        error.response?.data &&
        (error.response.data as MonoAccountErrorResponse).status === "failed"
      ) {
        const errorData = error.response.data as MonoAccountErrorResponse;
        return errorResponse(errorData.message || "Mono API request failed", {
          statusCode: error.response.status,
        });
      }

      // Handle empty or unexpected error responses
      return errorResponse(
        `Failed to fetch account details: ${error.response?.status || "No status code"}`,
        {
          statusCode: error.response?.status,
          errorCode: "UNKNOWN",
        }
      );
    }

    return errorResponse("Unexpected error during account details request", {
      error: (error as Error).message,
    });
  }
};

export const addBankAccountConnection = async ({
  userId,
  data,
  trx,
}: CreateNewBankAccountConnection): Promise<ApiResponse<{ id: string }>> => {
  const validInput = bankAccountConnectionInputCamel.safeParse(data);
  if (!validInput.success) {
    return errorResponse("Invalid input provided", validInput.error.flatten());
  }
  try {
    const knex = trx || knexClient;

    const toInsert = {
      ...validInput.data,
      created_by_id: userId,
    };

    const [id] = await knex("bank_account_connections")
      .insert(toInsert)
      .returning("id");
    if (!id) {
      return errorResponse("Failed to create bank account connection");
    }

    return successResponse("Bank account connection successfully created", {
      id,
    });
  } catch (error) {
    return errorResponse("Failed to create bank account connection", error);
  }
};

const findBankAccountMatches = async ({
  accountDetails,
  providerId,
  companyId,
}: {
  accountDetails: MonoAccountDetails;
  providerId?: string;
  companyId: string;
}): Promise<{
  exactMatch?: BankAccountMatch;
  fuzzyMatches: FuzzyMatch[];
  unconnectedAccounts: BankAccountMatch[];
  other?: { resolvedBankId?: string; resolvedCurrencyId?: string };
}> => {
  try {
    // Get all bank accounts for the company that are not connected to any provider
    const unconnectedBankAccounts: BankAccountMatch[] = await knexClient(
      "bank_accounts as ba"
    )
      .leftJoin(
        "bank_account_connections as bacc",
        "bank_accounts.id",
        "bank_account_connections.bank_account_id"
      )
      .join("banks as b", "ba.bank_id", "b.id")
      .join("currencies as cur", "ba.currency_id", "cur.id")
      .where("ba.company_id", companyId)
      .whereNull("bacc.id") // Not connected to any provider
      .andWhere("ba.is_deleted", false)
      .select([
        "ba.id as bankAccountId",
        "ba.display_name as accountName",
        "ba.account_number as accountNumber",
        "ba.bank_id as bankId",
        "b.display_name as bankName",
        "ba.currency_id as currencyId",
        "cur.code as currencyCode",
        "cur.name as currencyName",
        "cur.symbol as currencySymbol",
      ]);

    if (unconnectedBankAccounts.length === 0) {
      return {
        fuzzyMatches: [],
        unconnectedAccounts: [],
      };
    }

    const {
      currency: accountCurrencyCode,
      account_number: accountNumber,
      institution: { name: bankName, bank_code: bankCode },
    } = accountDetails;

    /**
     * Same account number, same bank, in the same company and currency; exact match
     * Get bank by checking bank_provider_mappings using bankInfo, retrieve bank_id
     * Get currency ID from currencies table using accountCurrencyCode
     * Check bank_accounts for account_number, bank_id, in the same company and maybe currency
     */

    // Resolve bank
    let bankQuery = knexClient("bank_provider_mappings");
    if (providerId) {
      bankQuery = bankQuery.where("provider_id", providerId).andWhere((qb) =>
        qb
          .where({ provider_alternate_id: bankCode })
          .orWhere({ provider_bank_secondary_reference: bankCode })
          .orWhere({ provider_bank_name: bankName })
          .orWhereRaw("raw_provider_data::jsonb @> ?", [
            JSON.stringify({ bank_code: bankCode }),
          ])
      );
    } else {
      // fallback for legacy data or when providerId missing
      bankQuery = bankQuery
        .where({ provider_alternate_id: bankCode })
        .orWhere({ provider_bank_secondary_reference: bankCode });
    }

    const resolvedBank: { bank_id: string } | undefined = await bankQuery
      .select("bank_provider_mappings.bank_id")
      .first();
    if (!resolvedBank) {
      return {
        fuzzyMatches: [],
        unconnectedAccounts: [],
      };
    }
    const resolvedBankId = resolvedBank.bank_id;

    // Resolve currency
    const resolvedCurrency: { id: string } | undefined = await knexClient(
      "currencies"
    )
      .select("id")
      .where("code", accountCurrencyCode.trim().toUpperCase())
      .first();

    if (!resolvedCurrency) {
      return {
        fuzzyMatches: [],
        unconnectedAccounts: [],
      };
    }
    const resolvedCurrencyId = resolvedCurrency.id;

    // Look for EXACT matches
    // Exact match criteria: account_number AND bank_id and currency_id must match exactly
    const exactMatch = unconnectedBankAccounts.find((acc) => {
      const accountNumberMatch =
        acc.accountNumber &&
        acc.accountNumber.toString().replace(/\s+/g, "") ===
          accountNumber.toString().replace(/\s+/g, "");

      const bankIdMatch = acc.bankId && acc.bankId === resolvedBankId;

      const currencyIdMatch =
        acc.currencyId && acc.currencyId === resolvedCurrencyId;

      return accountNumberMatch && bankIdMatch && currencyIdMatch;
    });

    if (exactMatch) {
      return {
        exactMatch,
        fuzzyMatches: [],
        unconnectedAccounts: unconnectedBankAccounts.filter(
          (acc) => acc.bankAccountId !== exactMatch.bankAccountId
        ),
      };
    }

    // Look for FUZZY matches
    const fuzzyMatches: FuzzyMatch[] = [];
    for (const account of unconnectedBankAccounts) {
      const matchScoreAndReasons = computeMatchScoreAndReasons({
        bankAccount: account,
        providerAccount: {
          ...accountDetails,
          resolvedBankId,
          resolvedCurrencyId,
        },
      });
      const { matchScore, matchReasons } = matchScoreAndReasons;

      // Only consider it a fuzzy match if score is above threshold (0.6)
      if (matchScore >= 0.6) {
        fuzzyMatches.push({
          ...account,
          matchScore,
          matchReasons,
        });
      }
    }

    // Sort fuzzy matches by score (highest first)
    fuzzyMatches.sort((a, b) => b.matchScore - a.matchScore);

    // Get remaining unconnected accounts (those not in fuzzy matches)
    const fuzzyMatchIds = new Set(
      fuzzyMatches.map((match) => match.bankAccountId)
    );
    const remainingUnconnected = unconnectedBankAccounts.filter(
      (account) => !fuzzyMatchIds.has(account.bankAccountId)
    );

    return {
      fuzzyMatches,
      unconnectedAccounts: remainingUnconnected,
      other: { resolvedBankId, resolvedCurrencyId },
    };
  } catch (error) {
    console.error("Error finding bank account matches:", error);
    return {
      fuzzyMatches: [],
      unconnectedAccounts: [],
    };
  }
};

export const updateBankAccountConnection = async ({
  connectionId,
  updates,
  trx,
}: {
  connectionId: string;
  updates: UpdateBankAccountConnection;
  trx?: Knex.Transaction;
}) => {
  const validatedUpdates = updateBankAccountConnectionCamel.safeParse(updates);

  if (!validatedUpdates.success) {
    return errorResponse(
      "Invalid input provided",
      validatedUpdates.error.flatten()
    );
  }

  try {
    const knex = trx || knexClient;

    const [updated] = await knex("bank_account_connections")
      .where({ id: connectionId })
      .update(validatedUpdates.data)
      .returning("*");

    if (!updated) {
      return errorResponse("Failed to update bank account connection");
    }
    return successResponse("Bank account connection updated successfully", {
      id: updated.id,
    });
  } catch (error) {
    return errorResponse("Failed to update bank account connection", error);
  }
};
