import api from "@/lib/axios";
import { RoleName } from "./types";

export const grantAccessToCompany = async (data: {
  userId: string;
  roleName: RoleName;
  companyId: string;
  email?: string;
}) => {
  const res = await api.post(`/api/${data.companyId}/grant-access`, data);
  return res.data;
};
