import { CompanyData, ServerResponseFormat } from "../types/types";
import api from "@/lib/axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const fetchCompany = async (
  companyId?: string | number
): Promise<ServerResponseFormat<CompanyData>> => {
  const response = await api.get(`${backendUrl}/api/companies`);
  return response.data;
};
