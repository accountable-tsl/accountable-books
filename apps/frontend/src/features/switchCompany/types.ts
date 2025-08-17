export type SwitchCompanyOpts = {
  companyId: string;
  onError?: (err: any) => void;
  onSuccess?: () => void;
  rememberCurrentAsOriginal?: boolean;
};
