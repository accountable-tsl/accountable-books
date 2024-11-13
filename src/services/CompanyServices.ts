import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const fetchCompany = async (companyId: string | number) => {
  const response = await axios.get(`${backendUrl}/api/companies/${companyId}`);
  return response.data;
};
