export type SwitchCompanyOpts = {
  companyId: string;
  onError?: (err: unknown) => void;
  onSuccess?: () => void;
  rememberCurrentAsOriginal?: boolean;
};
