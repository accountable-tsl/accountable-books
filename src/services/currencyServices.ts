import axios from "@/lib/axios";
import { CurrencyList, ServerResponseFormat } from "@/types/types";

export const fetchCurrencies = async (): Promise<
  ServerResponseFormat<CurrencyList[]>
> => {
  const response = await axios.get(`/api/currencies`);
  return response.data;
};
