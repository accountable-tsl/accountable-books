import { z } from 'zod';
import {
  createCamelCaseSchema,
  type SnakeToCamelCaseObject,
} from '../../shared/utils/formatting.utils.js';
import type { Knex } from 'knex';

export const bankAccountConnectionStatus = z.enum([
  'active',
  'revoked',
  'pending',
  'error',
  'pending_resolution',
]);
export type BankAccountConnectionStatus = z.infer<typeof bankAccountConnectionStatus>;

export const bankAccountConnectionInput = z.object({
  provider_bank_account_id: z.string().min(1),
  provider_bank_account_secondary_id: z.string().min(1).optional(),
  bank_account_id: z.string().uuid().nullish(),
  provider_id: z.string().uuid(),
  status: bankAccountConnectionStatus,
  raw_metadata: z.object({}).passthrough().nullish(),
  last_sync_at: z.date().optional(),
  connected_at: z.date().optional(),
  company_bank_credential_id: z.string().uuid(),
});

export const bankAccountConnectionInputCamel = createCamelCaseSchema(bankAccountConnectionInput);
export type BankAccountConnectionInput = SnakeToCamelCaseObject<
  z.infer<typeof bankAccountConnectionInput>
>;

export const newBankAccountConnection = bankAccountConnectionInput.extend({
  created_by_id: z.string().uuid(),
});
export type NewBankAccountConnection = z.infer<typeof newBankAccountConnection>;

export const bankAccountConnection = newBankAccountConnection.extend({
  id: z.string().uuid(),
});
export type BankAccountConnection = z.infer<typeof bankAccountConnection>;

const updateBankAccConnection = bankAccountConnectionInput.omit({ connected_at: true }).partial();
export const updateBankAccountConnectionCamel = createCamelCaseSchema(updateBankAccConnection);
export type UpdateBankAccountConnection = SnakeToCamelCaseObject<
  z.infer<typeof updateBankAccConnection>
>;
export type CreateNewBankAccountConnection = {
  userId: string;
  data: BankAccountConnectionInput;
  checkExisting?: boolean;
  trx?: Knex.Transaction;
};

export interface MonoAccountMeta {
  data_status: string;
  auth_method: string;
}

export interface InstitutionDetails {
  name: string;
  bank_code: string;
  type: string;
}

export interface MonoAccountDetails {
  id: string;
  name: string;
  currency: string;
  type: string;
  account_number: string | number;
  balance: number | string;
  bvn: string;
  institution: InstitutionDetails;
}

// export interface MonoAccountResponse {
//   status: "successful" | "failed";
//   message: string;
//   timestamp: string;
//   data: MonoAccountDetails;
// }

export interface MonoAccountErrorResponse {
  status: 'failed';
  message: string;
  data: null;
}

export interface MonoAccountSuccessResponse {
  status: 'successful';
  message: string;
  timestamp: string;
  data: {
    account: MonoAccountDetails;
    meta: MonoAccountMeta;
  };
}

export type MonoAccountResponse = MonoAccountSuccessResponse | MonoAccountErrorResponse;

export type ConnectionStatus = // For response only
  'connected' | 'needs_user_confirmation' | 'new_account_created' | 'error';

export type BankAccountMatch = {
  bankAccountId: string | null;
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

export interface FuzzyMatch extends BankAccountMatch {
  matchScore: number;
  matchReasons: string[];
}
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

    bankAccountId?: string;
  };

  accountDetails?: {
    bankAccountId: string;
    bankName: string;
    accountName: string;
    accountNumber: string;

    currency?: unknown;
  };

  suggestedBankAccountMatches?: (BankAccountMatch | any)[];

  connection?: {
    id: string;
    provider: {
      id: string;
      key: string;
      name: string;
      bankAccountId: string;
      providerBankAccountId: string;
    };
    status: ConnectionStatus;
    userActionRequired: boolean;
  };

  account?: {
    matched: boolean;
    matchType: 'exact' | 'fuzzy' | 'created' | 'unmatched';
    bankAccountId: string | null;
    displayName: string;
    accountNumber: string;
    bankName: string;
    matchConfidence?: 'strong' | 'weak';
  };

  suggestions?: {
    message: string;
    candidates: BankAccountMatch[];
  };
};
