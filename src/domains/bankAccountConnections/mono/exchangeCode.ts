import axios from "axios";

export const exchangeMonoCode = async ({
  code,
  secretKey,
}: {
  code: string;
  secretKey: string;
}): Promise<{ permanentMonoId: string }> => {
  try {
    if (!code || !secretKey) {
      throw new Error("Code and secret key are required");
    }

    const exchangeRes = await axios.post(
      "https://api.withmono.com/v2/accounts/auth",
      { code },
      {
        headers: {
          "mono-sec-key": secretKey,
          accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const responseData = exchangeRes.data;
    const accountId = responseData?.data?.id;
    if (!accountId || responseData.status !== "successful") {
      throw new Error(
        `Mono API error: ${responseData?.status} - ${responseData?.message || "Unknown error"}`
      );
    }

    return { permanentMonoId: accountId };
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      throw new Error(`Mono API request failed (${status}): ${message}`);
    }
    throw error instanceof Error ? error : new Error("Unknown Mono API error");
  }
};
