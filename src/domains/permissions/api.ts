import api from "@/lib/axios";
import { RoleName } from "./types";

export const grantAccessToCompany = async ({
  data,
}: {
  data: {
    userId: string;
    roleName: RoleName;
    companyId: string;
    email?: string;
  };
}) => {
  const res = await api.post(`/api/${data.companyId}/grant-access`, data);
  return res.data;
};

export const grantDemoAccess = async (data: {
  companyId: string;
  userId: string;
}) => {
  return await grantAccessToCompany({
    data: {
      ...data,
      roleName: "demo_user",
    },
  });
};
