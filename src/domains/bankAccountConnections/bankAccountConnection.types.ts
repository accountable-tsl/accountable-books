import { z } from "zod";
import {
  createCamelCaseSchema,
  SnakeToCamelCaseObject,
} from "../../shared/utils/formatting.utils";
import type { Knex } from "knex";

export const bankAccountConnectionStatus = z.enum([
  "active",
  "revoked",
  "pending",
  "error",
]);
export type BankAccountConnectionStatus = z.infer<
  typeof bankAccountConnectionStatus
>;

export const bankAccountConnectionInput = z.object({
  provider_id: z.string().uuid(),
  bank_account_id: z.string().uuid(),
  provider_bank_account_id: z.string().min(1),
  provider_bank_account_secondary_id: z.string().min(1).optional(),
  status: bankAccountConnectionStatus,
  raw_metadata: z.record(z.string(), z.any()).optional(),
  last_sync_at: z.date().optional(),
  connected_at: z.date().optional(),
  created_by_id: z.string().uuid().optional(),
});

export const bankAccountConnectionInputCamel = createCamelCaseSchema(
  bankAccountConnectionInput
);

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

export type CreateNewBankAccountConnection = {
  userId: string;
  data: BankAccountConnectionInput;
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
  account_number: string;
  balance: number;
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
  status: "failed";
  message: string;
  data: null;
}

export interface MonoAccountSuccessResponse {
  status: "successful";
  message: string;
  timestamp: string;
  data: {
    account: MonoAccountDetails;
    meta: MonoAccountMeta;
  };
}

export type MonoAccountResponse =
  | MonoAccountSuccessResponse
  | MonoAccountErrorResponse;
