import { ENV } from "../../../config/env";
import { UrlParams, UrlType } from "./email.types";

const routePaths = {
  "verify-email": "/auth/verify-email",
  "reset-password": "/auth/reset-password",
  "accept-invite": "/auth/accept-invite",
};

export const buildEmailServiceUrl = (
  type: UrlType,
  params: UrlParams
): string => {
  const baseUrl = ENV.BACKEND_URL?.trim().replace(/\/+$/, ""); // remove trailing slashes
  if (!baseUrl) throw new Error("BASE_URL is not set");

  if (!params.token) {
    throw new Error("Token parameter is required");
  }

  const path = routePaths[type];
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      query.append(key, value);
    }
  });

  return `${baseUrl}${path}?${query.toString()}`;
};
