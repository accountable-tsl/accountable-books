import api from "@/lib/axios";
import { ApiResponse } from "@/types/types";
import { CompanyData } from "./types";

export const getCompanyDetails = async (
  companyId: string
): Promise<ApiResponse<CompanyData>> => {
  const response = await api.get(`/api/companies/${companyId}`);
  return response.data;
};
