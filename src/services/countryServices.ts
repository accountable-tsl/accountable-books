import axios from "@/lib/axios";
import { CountryList, ServerResponseFormat } from "@/types/types";

export const getCountries = async (): Promise<
  ServerResponseFormat<CountryList[]>
> => {
  const res = await axios.get("/api/countries");
  return res.data;
};
