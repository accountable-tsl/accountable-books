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
import knexClient from "../../../knexClient";
import {
  bankAccountType,
  NewBankAccountInput,
} from "../bankAccounts/bankAccounts.types";
import { coaSource } from "../chartOfAccounts/coa.types";
import {
  BankAccountConnectionInput,
  bankAccountConnectionInputCamel,
  CreateNewBankAccountConnection,
  MonoAccountDetails,
  MonoAccountErrorResponse,
  MonoAccountResponse,
} from "./bankAccountConnection.types";
import { ApiResponse } from "../../core/types/api.types";

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

// const createBankAccountFromMono = async (monoAccount: any, companyId: string, userId: string) => { ... }

// Exchange temporary code to get permanent id from mono
export const getPermanentMonoId = async (
  code: string,
  userId: string,
  companyId: string
  //   trx?: Knex.Transaction
) => {
  //Maybe to even break this a little bit more
  try {
    const monoSecretKey = ENV.MONO_SECRET_KEY;
    if (!monoSecretKey)
      return errorResponse("Mono secret key is required", null, {
        report: true,
      });

    // Exchange temporary code to get permanent id
    const exchangeCode = await exchangeMonoCode({
      code,
      secretKey: monoSecretKey,
    });
    if (!exchangeCode.success || !exchangeCode.data) {
      return exchangeCode;
    }
    const monoAccountId = exchangeCode.data.permanentMonoId;

    // get mono account details
    const monoAccount = await getMonoAccountDetails({
      accountId: monoAccountId,
      secretKey: monoSecretKey,
    });
    if (!monoAccount.success || !monoAccount.data) {
      return monoAccount;
    }
    console.log({ monoAccountId, monoAccount });

    // Get mono provider
    const mono = await getBankFeedProviders({
      providerKeys: "mono",
    });

    if (!mono.success || !mono.data) {
      return errorResponse(mono.message || "Failed to get Mono provider");
    }
    const monoId = mono.data[0].id;

    // Get currencyId in db
    // Get bankId in db

    const newAccountData: NewBankAccountInput = {
      displayName: account.name, // required in bank account bable
      currencyId: "", // required in bank account bable
      bankId: "", // required in bank account bable
      accountNumber: account.number,
      accountType: bankAccountType.enum.other, // update later
      source: coaSource.enum.user,
    };

    // Create internal bank account
    const newBankAccount = await createNewBankAccount({
      companyId,
      userId,
      data: newAccountData,
    });
    if (
      !newBankAccount.success ||
      !newBankAccount.data ||
      !newBankAccount.data.id
    ) {
      return errorResponse(
        newBankAccount.message || "Failed to create bank account internally"
      );
    }

    const bankAccountId = newBankAccount.data.id;
    const connectionData: BankAccountConnectionInput = {
      providerId: monoId,
      bankAccountId,
      providerBankAccountId: account.id,
      status: "active",
      rawMetadata: response,
      lastSyncAt: new Date(),
    };

    // Create bank connection
    // Maybe we should make bank account id nullable in bank_account_connections table but we don't allow read ops if no bank account id
    // Coz the following have higher risk of failing
    const newBankAccountConnection = await createNewBankAccountConnection({
      userId,
      data: connectionData,
    });

    // Not sure what data to return
    return successResponse("Bank account connection created successfully", {
      code,
      newBankAccountConnection,
    });
  } catch (error) {
    return errorResponse("Failed to connect bank account", error);
  }
};

export const createNewBankAccountConnection = async ({
  userId,
  data,
  trx,
}: CreateNewBankAccountConnection): Promise<ApiResponse<{ id: string }>> => {
  try {
    const knex = trx || knexClient;
    const validInput = bankAccountConnectionInputCamel.safeParse(data);
    if (!validInput.success) {
      return errorResponse(
        "Invalid input provided",
        validInput.error.flatten()
      );
    }

    const toInsert = {
      ...validInput.data,
      created_by_id: validInput.data.created_by_id || userId,
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
