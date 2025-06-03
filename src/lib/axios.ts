import { isPublicRoute } from "@/shared/routes/utils";
import { routes } from "@/shared/routes/routes";
import { getCookie } from "@/utils/utils";
import axios, { AxiosError, AxiosRequestConfig } from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
  withCredentials: true,
});

// Auto-attach CSRF token for mutating requests
api.interceptors.request.use((config) => {
  const csrfToken = getCookie("csrfToken");
  const token = localStorage.getItem("csrfToken");

  const method = config.method?.toLowerCase() || "";

  if (token && ["post", "put", "patch", "delete"].includes(method)) {
    config.headers["X-CSRF-Token"] = token;
    return config;
  }

  if (
    csrfToken &&
    config.method &&
    ["post", "put", "patch", "delete"].includes(config.method.toLowerCase())
  ) {
    config.headers["X-CSRF-Token"] = csrfToken;
  }

  return config;
});

// Response interceptor for silent refresh
let isRefreshing = false;
let failedQueue: {
  resolve: (value?: any) => void;
  reject: (error: any) => void;
  config: AxiosRequestConfig;
}[] = [];

const processQueue = (error: any) => {
  failedQueue.forEach(({ reject, resolve, config }) => {
    if (error) reject(error);
    else resolve(api(config));
  });
  failedQueue = [];
};

interface RequestWithRetry extends AxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const original = error.config as RequestWithRetry;

    if (
      error.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes("/auth")
    ) {
      original._retry = true;
      if (isRefreshing) {
        // queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject, config: original });
        });
      }

      isRefreshing = true;
      // kick off one refresh call
      return new Promise((resolve, reject) => {
        api
          .post("/auth/refresh", {}, { withCredentials: true })
          .then((refreshResp) => {
            // cookies (accessToken, csrfToken) are reset by server
            // const csrf = getCookie("csrfToken");
            const newCsrfToken =
              refreshResp.data.csrfToken || localStorage.getItem("csrfToken");

            if (newCsrfToken) {
              // update header on the original request
              localStorage.setItem("csrfToken", newCsrfToken);
              original.headers!["X-CSRF-Token"] = newCsrfToken;
            }
            processQueue(null);
            resolve(api(original));
          })
          .catch((err) => {
            processQueue(err);
            const path = window.location.pathname;
            const shouldRedirect = !isPublicRoute(path);

            if (shouldRedirect) {
              window.location.href = routes.login.staticPath;
            }
            reject(err);
          })
          .finally(() => {
            isRefreshing = false;
          });
      });
    }
    return Promise.reject(error);
  }
);

export default api;
