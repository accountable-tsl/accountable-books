import axios from '@/lib/axios';
import type { ApiResponse, Country } from '@/shared/types/core';

export const getCountries = async (): Promise<ApiResponse<Country[]>> => {
  const res = await axios.get('/api/countries');
  return res.data;
};
