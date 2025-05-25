import { ENV, isProd } from "../../config/env";

export const splitIntoWords = (input: string | string[]): string[] => {
  const text = Array.isArray(input) ? input.join(" ") : input;
  const words = text
    .trim()
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word !== "");

  return words;
};

export function getAppUrl(firmSlug?: string): string {
  const baseDomain =
    ENV.BASE_DOMAIN || (isProd ? "getaccountable.com" : "lvh.me");
  const frontendPort = ENV.FRONTEND_PORT || "5173";
  const protocol = isProd ? "https" : "http";
  const portSegment = !isProd && frontendPort ? `:${frontendPort}` : "";
  const subdomain = firmSlug ? `${firmSlug}.` : "app.";

  return `${protocol}://${subdomain}${baseDomain}${portSegment}`;
}
