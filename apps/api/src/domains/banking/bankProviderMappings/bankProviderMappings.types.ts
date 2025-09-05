import { z } from 'zod';
import {
  createCamelCaseSchema,
  type SnakeToCamelCaseObject,
} from '../../../shared/utils/formatting.utils.js';
import { dbBaseFields } from '../../../core/types/core.js';
import type { Knex } from 'knex';

const newBankProviderMappingInput = z.object({
  provider_id: z.string().uuid(),
  bank_id: z.string().uuid(),
  provider_bank_id: z.string(),
  provider_alternate_id: z.string().nullish(),
  provider_bank_secondary_reference: z.string().nullish(),
  provider_bank_name: z.string().nullish(),
  raw_provider_data: z.record(z.string(), z.any()).nullish(),
});
export type NewBankProviderMappingInput = z.infer<typeof newBankProviderMappingInput>;
export const newBankProviderMappingCamel = createCamelCaseSchema(newBankProviderMappingInput);
export type NewBankProviderMappingInputCamel = SnakeToCamelCaseObject<
  z.infer<typeof newBankProviderMappingInput>
>;

export const newBankProviderMapping = newBankProviderMappingInput.extend({
  id: z.string().uuid().optional(),
  created_by_id: z.string().uuid(),
  updated_by_id: z.string().uuid().optional(),
});
export type NewBankProviderMapping = z.infer<typeof newBankProviderMapping>;

export const bankProviderMapping = newBankProviderMapping.merge(dbBaseFields);
export type BankProviderMapping = z.infer<typeof bankProviderMapping>;

export type CreateBankProviderMappings = {
  userId: string;
  input: NewBankProviderMappingInputCamel[];
  trx?: Knex.Transaction;
};

type ProviderMappingInput = { providerKey: string } | { providerId: string };
type BankMappingInput =
  | { internalBankId: string }
  | { providerBankId: string }
  | { internalBankId: string; providerBankId: string };

// Simple input type for getBankProviderMapping
export type GetBankProviderMappingInput = ProviderMappingInput &
  BankMappingInput & {
    // Optional filters
    providerBankName?: string;
    search?: string;
  };

// Response type for getBankProviderMapping
export interface GetBankProviderMappingResponse {
  bankId: string;
  bankKey: string;
  bankDisplayName: string;
  bankOfficialName: string;
  providerId: string;
  providerKey: string;
  providerName: string;
  providerStatus: string;
  providerBankId: string;
  providerAlternateId: string | null;
  providerBankSecondaryReference: string | null;
  providerBankName: string;
}

export interface MonoInstitution {
  id: string;
  institution: string;
  type: string;
  nip_code: string;
  bank_code: string;
  country: string;
  auth_methods: {
    _id: string;
    type: string;
    name: string;
    identifier: string;
  }[];
  scope: { name: string; type: string }[];
}

export interface MonoBankCoverage {
  status: 'successful';
  message: string;
  timestamp: string;
  data: MonoInstitution[];
}
