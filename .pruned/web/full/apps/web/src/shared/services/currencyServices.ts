import axios from '@/lib/axios';
import type { CurrencyList, ApiResponse } from '@/shared/types/core';

export const fetchCurrencies = async (): Promise<ApiResponse<CurrencyList[]>> => {
  const response = await axios.get('/api/currencies');
  return response.data;
};
