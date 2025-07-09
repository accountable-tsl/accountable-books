import api from "@/lib/axios";

export const fetchBanksByCountryId = async (countryId: string) => {
  const response = await api.get(
    `/api/banks/by-country?countryId=${countryId}`
  );
  return response.data;
};

export const fetchBanksByCountryCode = async (countryCode: string) => {
  const response = await api.get(
    `/api/banks/by-country?countryCode=${countryCode}`
  );
  return response.data;
};
