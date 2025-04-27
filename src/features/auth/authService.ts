import { LoginForm } from "./authTypes";
import api from "@/lib/axios";
import { isAxiosError } from "axios";
import { routes } from "@/utils/routes";

interface LoginData {
  user: any;
  currentCompanyId: string;
}

export const handleLogin = async (data: LoginForm) => {
  try {
    const resp = await api.post("/auth/login", data, {
      withCredentials: true,
    });
    return { success: true, data: resp.data.data };
  } catch (err: any) {
    if (isAxiosError(err) && err.response?.data) {
      const { code, message } = err.response.data;
      return { success: false, code, message };
    }
    return { success: false, message: "An unexpected error occurred" };
  }
};

export const handleLogout = async () => {
  try {
    await api.post("/auth/logout");
    window.location.href = routes.auth.logout;
    // TODO: Clear user from context or any in-memory state
  } catch (error) {
    window.location.href = routes.auth.login;
  }
};
