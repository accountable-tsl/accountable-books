import { AuthUserContext, LoginForm } from "./types";
import api from "@/lib/axios";
import { isAxiosError } from "axios";
import { ApiResponse } from "@/shared/types/core";
import { authStore } from "@/features/auth/store";

export const handleLogin = async (
  data: LoginForm
): Promise<ApiResponse<{ user: AuthUserContext; csrfToken: string }>> => {
  try {
    const resp = await api.post("/auth/login", data);
    console.log("actual api resp", resp.data.data);
    return resp.data as ApiResponse<{
      user: AuthUserContext;
      csrfToken: string;
    }>;
  } catch (err: any) {
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }

    return { success: false, message: "An unexpected error occurred" };
  }
};

export const handleLogout = async () => {
  await api.post("/auth/logout").catch(() => {});
  // authStore.getState().clearAuth();
  // window.location.replace("/login");
};

/**
 * When the page refreshes or user visits a new tab, memory is wiped — Zustand store is reset
 * Cookies are still set but we lose csrfToken and user data
 * So we need to verify the current session and get user data and token from the backend
 *
 * This is because we're storing csrfToken in store and not local or session storage for security reasons
 */
export const fetchSession = async (): Promise<
  ApiResponse<{ user: AuthUserContext; csrfToken: string }>
> => {
  const res = await api.get("/auth/me");
  return res.data;
};
// export const fetchSession = async (): Promise<
//   ApiResponse<{ user: AuthUserContext; csrfToken: string }>
// > => {
//   try {
//     const res = await api.get("/auth/me");
//     return res.data as ApiResponse<{
//       user: AuthUserContext;
//       csrfToken: string;
//     }>;
//   } catch (err: unknown) {
//     if (isAxiosError(err) && err.response?.data) {
//       return err.response.data;
//     }

//     return { success: false, message: "An unexpected error occurred" };
//   }
// };

export const refreshToken = async (): Promise<
  ApiResponse<{ csrfToken: string }>
> => {
  try {
    const res = await api.post("/auth/refresh");
    return res.data as ApiResponse<{ csrfToken: string }>;
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }

    return { success: false, message: "An unexpected error occurred" };
  }
};
