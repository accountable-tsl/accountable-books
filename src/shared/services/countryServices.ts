import axios from "@/lib/axios";
import { CountryList, ApiResponse } from "@/types/types";

export const getCountries = async (): Promise<ApiResponse<CountryList[]>> => {
  const res = await axios.get("/api/countries");
  return res.data;
};
