import api from "@/lib/axios";
import { ServerResponseFormat } from "@/types/types";
import { CompanyData } from "./types";

export const getCompanyDetails = async (
  companyId: string
): Promise<ServerResponseFormat<CompanyData>> => {
  const response = await api.get(`/api/companies/${companyId}`);
  console.log(response);
  return response.data;
};
