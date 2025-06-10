import axios from "@/lib/axios";
import { CountryList, ApiResponse } from "@/shared/types/core";

export const getCountries = async (): Promise<ApiResponse<CountryList[]>> => {
  const res = await axios.get("/api/countries");
  return res.data;
};
