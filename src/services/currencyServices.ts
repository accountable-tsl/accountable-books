import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const fetchCurrencies = async () => {
  const response = await axios.get(`${backendUrl}/api/currencies`);
  return response.data;
};
