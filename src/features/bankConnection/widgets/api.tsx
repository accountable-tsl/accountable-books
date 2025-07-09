import api from "@/lib/axios";
import { ApiResponse } from "@/shared/types/core";
import { ConnectionResponse } from "../connectViaFeed/types";
import { isAxiosError } from "axios";

export const handleBankAccountConnection = async ({
  companyId,
  provider,
  data,
}: {
  companyId: string;
  provider: "mono" | "plaid" | "okra" | "stripe";
  data: any;
}): Promise<ApiResponse<{ connections: ConnectionResponse[] }>> => {
  try {
    const res = await api.post(`/api/${companyId}/bank-connections/`, {
      provider,
      data,
    });
    console.log(res.status, res.data);
    return res.data;
  } catch (err: any) {
    if (isAxiosError(err) && err.response?.data) {
      console.log("err.response.data", err.response.data);
      return err.response.data;
    }

    return { success: false, message: "An unexpected error occurred" };
  }
};

export const handleMonoConnection = async ({
  companyId,
  data,
}: {
  companyId: string;
  data: { code: string };
}) => {
  return await handleBankAccountConnection({
    companyId,
    provider: "mono",
    data,
  });
};
