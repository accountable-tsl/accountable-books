import { LoginForm } from "./types";
import api from "@/lib/axios";
import { isAxiosError } from "axios";
import { ServerResponseFormat } from "@/types/types";

export const handleLogin = async (data: LoginForm) => {
  try {
    const resp = await api.post("/auth/login", data);
    return { success: true, data: resp.data.data };
  } catch (err: any) {
    if (isAxiosError(err) && err.response?.data) {
      const { code, message } = err.response.data;
      return { success: false, code, message };
    }
    return { success: false, message: "An unexpected error occurred" };
  }
};

export const backendLogout = async () => {
  await api.post("/auth/logout");
};

export const fetchSession = async (): Promise<
  ServerResponseFormat<{
    id: string;
    email: string;
    firstname: string;
    lastname?: string;
    currentCompanyId: string;
  }>
> => {
  const res = await api.get("/auth/me");
  return res.data;
};
