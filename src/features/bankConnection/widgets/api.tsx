import api from "@/lib/axios";
import { ApiResponse } from "@/shared/types/core";
import { ConnectionResponse } from "../connectViaFeed/types";

export const handleBankAccountConnection = async ({
  companyId,
  provider,
  data,
}: {
  companyId: string;
  provider: "mono" | "plaid" | "okra" | "stripe";
  data: any;
}): Promise<ApiResponse<{ connections: ConnectionResponse[] }>> => {
  const res = await api.post(`/api/${companyId}/bank-connections/`, {
    provider,
    data,
  });

  return res.data;
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
