import { getCompanyIdentifiers } from "../../domains/companies/companies.utils";

export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const getCompanyUUID = async (identifier: string): Promise<string> => {
  const { id } = await getCompanyIdentifiers(identifier);
  return id;
};

export const getCompanyShortCode = async (
  identifier: string
): Promise<string> => {
  const { short_code } = await getCompanyIdentifiers(identifier);
  return short_code;
};
