import axios from "axios";
import { MonoAccountDetails, MonoAccountResponse } from "../baccons.types";

export const getMonoAccountDetails = async ({
  accountId,
  secretKey,
}: {
  accountId: string;
  secretKey: string;
}): Promise<{
  account: MonoAccountDetails;
  meta: Partial<MonoAccountDetails>;
}> => {
  try {
    const { data } = await axios.get<MonoAccountResponse>(
      `https://api.withmono.com/v2/accounts/${accountId}`,
      {
        headers: {
          "mono-sec-key": secretKey,
          accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    // Validate response structure
    if (data.status !== "successful" || !data.data?.account) {
      throw new Error(
        data.message || "Invalid response structure from Mono API"
      );
    }

    const account = data.data.account;
    const accountMetaToSave = {
      id: account.id,
      name: account.name,
      currency: account.currency,
      account_number: account.account_number,
      bvn: account.bvn,
      institution: {
        name: account.institution.name,
        bank_code: account.institution.bank_code,
        type: account.institution.type,
      },
    };

    console.log({ m3etaToSave: accountMetaToSave });
    return { account: data.data.account, meta: accountMetaToSave };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      throw new Error(`Mono API request failed (${status}): ${message}`);
    }
    throw error instanceof Error ? error : new Error("Unknown Mono API error");
  }
};
