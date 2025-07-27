import api from "@/lib/axios";
import { AccountClassificationMetadata } from "@/domains/account-classification/types";

export const getAccountClassificationMetadata =
  async (): Promise<AccountClassificationMetadata> => {
    const response = await api.get("/api/v1/accounts/classification/metadata");
    return response.data.data;
  };
