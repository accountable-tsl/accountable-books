import { CountryList } from "@/types/types";

export const formatPhoneNumber = (input: string, country: CountryList) => {
  // Filter input: keep digits and leading + if present
  const cleaned = input
    .replace(/[^\d+]/g, "") // Remove non-digits except +
    .replace(/(?!^)\+/g, ""); // Remove + unless it's the first character

  // If unknown country, return cleaned input without formatting
  if (country.code === "UNKNOWN") {
    return cleaned;
  }

  // Remove + for formatting purposes
  const digits = cleaned.replace(/\D/g, "");

  // Add a space every 3 or 4 digits for readability
  const formatted = digits.replace(/(\d{3,4})(?=\d)/g, "$1 ");

  // Return with + prefix if it was originally included
  return cleaned.startsWith("+") ? `+${formatted}` : formatted;
};

export const extractPath = (url: string): string => {
  return url.replace(/^.*?\.[\w.]+\//, "");
};

export function toTitleCase(
  text: string,
  options?: {
    delimiter?: string | RegExp;
    joinWith?: string;
    preserveUppercase?: boolean;
  }
) {
  const {
    delimiter = /\s+/,
    joinWith = " ",
    preserveUppercase = true,
  } = options || {};

  return text
    .split(delimiter)
    .filter(Boolean)
    .map((word) => {
      if (preserveUppercase && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(joinWith);
}
