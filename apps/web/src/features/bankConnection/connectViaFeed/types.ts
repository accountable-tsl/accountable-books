export type ConnectBankAccountProps = {
  onSuccess?: (res?: any) => void;
  options?: ConnectBankAccountPropOptions;
};

export type ConnectBankAccountPropOptions = {
  className?: string;
  stepClassName?: string;
  footerClassName?: string;
};

export type ConnectionStatus =
  | 'connected'
  | 'needs_user_confirmation'
  | 'new_account_created'
  | 'error';

export type BankAccountMatch = {
  bankAccountId: string;
  accountName: string;
  accountNumber: string;

  bankId: string | null;
  bankName: string;

  currencyId: string;
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;

  matchedFields?: string[];
};

export type ConnectionResponse = {
  userActionRequired: boolean;
  connectionStatus: ConnectionStatus;
  message: string;

  connectionDetails: {
    connectionId: string;

    providerId: string;
    providerName: string;
    providerKey: string;

    providerBankAccountId: string;

    bankAccountId: string;
  };

  accountDetails?: {
    bankAccountId: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
  };

  suggestedBankAccountMatches: BankAccountMatch[];
};
