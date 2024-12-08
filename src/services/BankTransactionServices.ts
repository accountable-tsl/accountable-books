import axios from "axios";
import { BankTransactionBatch, ServerResponseFormat } from "../types/types";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const postBankTransactions = async (
  companyId: string | number,
  data: BankTransactionBatch
): Promise<ServerResponseFormat> => {
  const response = await axios.post(
    `${backendUrl}/api/${companyId}/bank-accounts/transactions/import`,
    data
  );
  return response.data.response;
};
