export type SwitchCompanyOpts = {
  fromCompanyId?: string;
  toCompanyId: string;
  onError?: (err: unknown) => void;
  onSuccess?: () => void;
  rememberCurrentAsOriginal?: boolean;
};
