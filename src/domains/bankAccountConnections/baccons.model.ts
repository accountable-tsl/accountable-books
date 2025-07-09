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
} from "./baccons.types";
import { computeMatchScoreAndReasons } from "./baccons.utils";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import { markCompanyOnboardingStepComplete } from "../../features/onboarding/onboarding.utils";
import { getBankConnectionNeeds } from "./shared/prerequisites";
import { exchangeMonoCode } from "./mono/exchangeCode";
import { getMonoAccountDetails } from "./mono/getAccountDetails";
import { getProvider } from "./shared/getProvider";
import { checkForDuplicate } from "./shared/checkDuplicate";
import { updateBankAccountOnboardingState } from "./shared/updateOnboarding";
import { createBankAccount } from "./shared/createBankAccount";
import { resolveBankFromMonoDetails } from "./shared/resolveBank";
import { resolveCurrency } from "./shared/resolveCurrency";
import { matchEngine } from "./shared/smartMatching";

type Args = {
  code: string;
  providerKey: string;
  userId: string;
  companyId: string;
};

export const handleBankConnection = async (args: Args) => {
  const { code, providerKey, userId, companyId: providedCompanyId } = args;

  const res = knexClient.transaction(async (trx) => {
    const preRequisites = await getBankConnectionNeeds({
      companyId: providedCompanyId,
      trx,
    });

    const {
      companyId,
      updateOnboardingState,
      hasUnmatchedAccounts,
      unmatchedAccounts,
    } = preRequisites;
  });
};

export const handleMonoConnection = async ({
  code,
  userId,
  companyId: providedCompanyId,
}: {
  code: string;
  providerKey?: string;
  userId: string;
  companyId: string;
  trx: Knex.Transaction;
}): Promise<ApiResponse<{ connections: ConnectionResponse[] }>> => {
  if (!code?.trim()) {
    return errorResponse("Invalid authorization code");
  }
  if (!userId?.trim()) {
    return errorResponse("User ID is required");
  }
  if (!providedCompanyId?.trim()) {
    return errorResponse("Company ID is required");
  }

  const secretKey = ENV.MONO_SECRET_KEY;
  if (!secretKey) throw new Error("Mono secret key not found");
  try {
    const res = await knexClient.transaction(async (trx) => {
      const preRequisites = await getBankConnectionNeeds({
        companyId: providedCompanyId,
        trx,
      });

      const {
        companyId,
        updateOnboardingState,
        hasUnmatchedAccounts,
        unmatchedAccounts,
        currentOnboardingState,
      } = preRequisites;

      let permanentMonoId: string;
      let account: any;
      let meta: any;

      try {
        const exchangeResult = await exchangeMonoCode({ code, secretKey });
        permanentMonoId = exchangeResult.permanentMonoId;

        const accountResult = await getMonoAccountDetails({
          accountId: permanentMonoId,
          secretKey,
        });
      } catch (error) {
        return errorResponse(
          "Failed to retrieve account details from Mono."
        );
      }

      const provider = await getProvider("mono", trx);

      // We should try to make sure user does not connect to the same account twice
      // TODO: Not handled yet, case where user is trying to connect to the same account via different provider
      // TODO: Maybe we should allow and if successful, update the existing connection
      const { exists, connection: existingConnection } =
        await checkForDuplicate({
          providerId: provider.id,
          providerUniqueBankAccountId: permanentMonoId,
          pruneStates: ["pending", "error", "revoked"],
          trx,
        });

      if (exists) {
        if (updateOnboardingState && currentOnboardingState) {
          await updateBankAccountOnboardingState(
            currentOnboardingState,
            companyId
          );
        }

        // TODO: create formatConnectionResponse function and use here
        return successResponse("Bank account already connected", {
          connections: [
            {
              userActionRequired: false,
              connectionStatus: "connected",
              message: "Bank account already connected",
              connectionDetails: {
                connectionId: existingConnection?.id,
                providerId: provider.id,
                providerName: provider.name,
                providerKey: provider.key,
                providerBankAccountId: permanentMonoId,
                bankAccountId: existingConnection?.bankAccountId,
              },
              accountDetails: {
                accountNumber: account.account_number.toString(),
                accountName: account.name,
                bankName: account.institution.name,
                currency: account.currency,
              },
            },
          ],
        });
      }

      // Map bank, retrieve currency id
      const { bankId } = await resolveBankFromMonoDetails({
        providerId: provider.id,
        institutionName: account.institution.name,
        bankCode: account.institution.bank_code,
        institutionType: account.institution.type,
        trx,
      });

      const { currency } = await resolveCurrency({
        currencyCode: account.currency,
        trx,
      });

      if (!exists && !hasUnmatchedAccounts) {
        // TODO: Persist fully (Add bank account & connection) otherwise
        // Get currency, internal bank
        const newConnection = await addBankAccountConnection({
          userId,
          data: {
            providerId: provider.id,
            providerBankAccountId: permanentMonoId,
            bankAccountId: null,
            status: "active",
            rawMetadata: meta,
          },
          trx,
        });

        const newBankAccount = await createBankAccount({
          bankId,
          userId,
          companyId,
          currencyId: currency.id,
          accountName: account.name,
          accountNumber: account.account_number.toString(),
        });

        // TODO: create formatConnectionResponse function and use here
        return successResponse("Bank account successfully connected", {
          connections: [
            {
              userActionRequired: false,
              connectionStatus: "connected",
              message: "Bank account successfully connected",
              connectionDetails: {
                connectionId: newConnection.data?.id,
                providerId: provider.id,
                providerName: provider.name,
                providerKey: provider.key,
                providerBankAccountId: permanentMonoId,
                bankAccountId: newBankAccount.bankAccountId,
              },
              accountDetails: {
                accountNumber: account.account_number.toString(),
                accountName: account.name,
                bankName: account.institution.name,
                currency: account.currency,
              },
            },
          ],
        });
      }

      if (!unmatchedAccounts) return errorResponse("No accounts to connect to");

      // Smart matching
      const matchResult = matchEngine({
        accountsInSystem: unmatchedAccounts,
        accountToBeMatched: {
          ...account,
          resolvedBankId: bankId,
          resolvedCurrencyId: currency.id,
          resolvedCurrencyCode: currency.code,
        },
      });

      if (matchResult.exactMatch) {
        await addBankAccountConnection({
          userId,
          data: {
            providerId: provider.id,
            providerBankAccountId: permanentMonoId,
            bankAccountId: matchResult.exactMatch.id,
            status: "active",
            rawMetadata: meta,
          },
          trx,
        });

        // TODO: create formatConnectionResponse function and use here
        return successResponse("Bank account successfully connected", {
          connections: [
            {
              userActionRequired: false,
              connectionStatus: "connected",
              message: "Bank account successfully connected",
              connectionDetails: {
                providerId: provider.id,
                providerName: provider.name,
                providerKey: provider.key,
                providerBankAccountId: permanentMonoId,
                bankAccountId: matchResult.exactMatch.id,
              },
              accountDetails: {
                accountNumber: account.account_number.toString(),
                accountName: account.name,
                bankName: account.institution.name,
                currency: account.currency,
              },
            },
          ],
        });
      }

      return successResponse("Unable to match account", {
        connections: [
          {
            userActionRequired: true,
            connectionStatus: "pending",
            message: "Unable to match account",
            connectionDetails: {
              providerId: provider.id,
              providerName: provider.name,
              providerKey: provider.key,
              providerBankAccountId: permanentMonoId,
            },
            accountDetails: {
              accountNumber: account.account_number.toString(),
              accountName: account.name,
              bankName: account.institution.name,
              currency: account.currency,
            },
            suggestedBankAccountMatches: [
              ...matchResult.fuzzyMatches,
              ...matchResult.unmatched,
            ],
          },
        ],
      });
    });
  } catch (error) {}
};

export const addBankAccountConnection = async ({
  userId,
  data,
  checkExisting = false,
  trx,
}: CreateNewBankAccountConnection): Promise<ApiResponse<{ id: string }>> => {
  const validInput = bankAccountConnectionInputCamel.safeParse(data);
  if (!validInput.success) {
    return errorResponse("Invalid input provided", validInput.error.flatten());
  }
  const execute = async (knex: Knex.Transaction) => {
    if (checkExisting) {
      const { exists, connection } = await checkForDuplicate({
        providerUniqueBankAccountId: validInput.data.provider_bank_account_id,
        providerId: validInput.data.provider_id,
        pruneStates: ["error", "pending", "revoked"],
        trx: knex,
      });

      if (exists) {
        return successResponse("Bank account connection already exists", {
          id: connection?.id,
        });
      }
    }

    const toInsert = {
      ...validInput.data,
      created_by_id: userId,
    };

    const [row] = await knex("bank_account_connections")
      .insert(toInsert)
      .returning("id");

    if (!row?.id) {
      return errorResponse("Failed to create bank account connection");
    }

    return successResponse("Bank account connection successfully created", {
      id: row.id,
    });
  };
  try {
    const result = trx
      ? await execute(trx)
      : await knexClient.transaction(execute);

    return result;
  } catch (error) {
    return errorResponse("Failed to create bank account connection", error);
  }
};

const findBankAccountMatches = async ({
  accountDetails,
  providerId,
  companyId,
  trx,
}: {
  accountDetails: MonoAccountDetails;
  providerId?: string;
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<{
  exactMatch?: BankAccountMatch;
  fuzzyMatches: FuzzyMatch[];
  unconnectedAccounts: BankAccountMatch[];
  other?: { resolvedBankId?: string; resolvedCurrencyId?: string };
}> => {
  const knex = trx || (await knexClient.transaction());
  try {
    // Get all bank accounts for the company that are not connected to any provider
    const unconnectedBankAccounts: BankAccountMatch[] = await knex
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
      ])
      .from("bank_accounts as ba")
      .leftJoin(
        "bank_account_connections as bacc",
        "ba.id",
        "bacc.bank_account_id"
      )
      .join("banks as b", "ba.bank_id", "b.id")
      .join("currencies as cur", "ba.currency_id", "cur.id")
      .where("ba.company_id", companyId)
      .whereNull("bacc.id") // Not connected to any provider
      .andWhere("ba.is_deleted", false);

    // if (unconnectedBankAccounts?.length === 0) {
    //   return {
    //     fuzzyMatches: [],
    //     unconnectedAccounts: [],
    //   };
    // }

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
    let bankQuery = knex("bank_provider_mappings");
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
    console.log({ resolvedBank });
    if (!resolvedBank) {
      return {
        fuzzyMatches: [],
        unconnectedAccounts: [],
      };
    }
    const resolvedBankId = resolvedBank.bank_id;

    // Resolve currency
    const resolvedCurrency: { id: string; code: string } | undefined =
      await knex("currencies")
        .select("id", "code")
        .where("code", accountCurrencyCode.trim().toUpperCase())
        .first();
    console.log({ resolvedCurrency });
    if (!resolvedCurrency) {
      return {
        fuzzyMatches: [],
        unconnectedAccounts: [],
      };
    }
    const resolvedCurrencyId = resolvedCurrency.id;
    const resolvedCurrencyCode = resolvedCurrency.code;

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
    // Filter first by currency since we now know that and maybe by bank
    const unconnectedBankAccountsNarrowed = unconnectedBankAccounts.filter(
      (acc) =>
        // "All is true" condition
        acc.currencyCode === resolvedCurrencyCode &&
        acc.bankId === resolvedBankId &&
        acc.currencyId === resolvedCurrencyId
    );

    const fuzzyMatches: FuzzyMatch[] = [];
    for (const account of unconnectedBankAccountsNarrowed) {
      const matchScoreAndReasons = computeMatchScoreAndReasons({
        bankAccount: account,
        providerAccount: {
          ...accountDetails,
          resolvedBankId,
          resolvedCurrencyId,
        },
      });

      console.log(matchScoreAndReasons);
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
    const remainingUnconnected = unconnectedBankAccountsNarrowed.filter(
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
