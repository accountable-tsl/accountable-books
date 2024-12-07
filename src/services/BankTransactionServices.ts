import axios from "axios";
import { BankTransactionBatch } from "../types/types";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const postBankTransactions = async (
  companyId: string | number,
  data: BankTransactionBatch
) => {
  const response = await axios.post(
    `${backendUrl}/api/${companyId}/bank-accounts/transactions/import`,
    data
  );
  return response.data;
};
