import type { ApiResponse, CurrencyList } from '@/shared/types/core';
import axios from '@/lib/axios';

export const fetchCurrencies = async (): Promise<
  ApiResponse<CurrencyList[]>
> => {
  const response = await axios.get('/api/currencies');
  return response.data;
};
