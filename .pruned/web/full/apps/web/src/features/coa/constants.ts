export const ACCOUNT_TYPE_BLACKLIST = ['ca_bank'] as const;
export type BlacklistedType = (typeof ACCOUNT_TYPE_BLACKLIST)[number];
