import type { Knex } from 'knex';
import { z } from 'zod';

import { createCamelCaseSchema } from '../../../shared/utils/formatting.utils.js';

import type { SnakeToCamelCaseObject } from '../../../shared/utils/formatting.utils.js';

const newBankProviderMappingInput = z.object({
  bank_feed_provider_id: z.uuid(),
  bank_id: z.uuid(),
  provider_institution_id: z.string().trim().min(1).max(128),
  provider_institution_alternate_id: z.string().trim().min(1).max(64).nullish(),
  provider_institution_secondary_reference: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .nullish(),
  provider_institution_name: z.string().trim().min(1).max(256).nullish(),
  raw_provider_data: z.record(z.string(), z.any()).nullish(),
});
export type NewBankProviderMappingInput = z.infer<
  typeof newBankProviderMappingInput
>;
export const newBankProviderMappingCamel = createCamelCaseSchema(
  newBankProviderMappingInput,
);
export type NewBankProviderMappingInputCamel = SnakeToCamelCaseObject<
  z.infer<typeof newBankProviderMappingInput>
>;

export const newBankProviderMapping = newBankProviderMappingInput.extend({
  id: z.uuid().optional(),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
});
export type NewBankProviderMapping = z.infer<typeof newBankProviderMapping>;

export const bankProviderMapping = newBankProviderMapping.extend({
  id: z.uuid(),
  deleted_by_id: z.uuid().nullish(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
  is_deleted: z.boolean().optional(),
  deleted_at: z.date().nullish(),
});
export type BankProviderMapping = z.infer<typeof bankProviderMapping>;

export type CreateBankProviderMappings = {
  userId: string;
  input: NewBankProviderMappingInputCamel[];
  trx?: Knex.Transaction;
};

type ProviderMappingInput = { providerKey: string } | { providerId: string };
type BankMappingInput =
  | { internalBankId: string }
  | { providerInstitutionId: string }
  | { internalBankId: string; providerInstitutionId: string };

export type GetBankProviderMappingInput = ProviderMappingInput &
  BankMappingInput & {
    providerInstitutionName?: string;
    search?: string;
  };

export interface GetBankProviderMappingResponse {
  bankId: string;
  bankKey: string;
  bankLogoUrl: string | null;
  bankDisplayName: string;
  bankOfficialName: string;
  providerId: string;
  providerKey: string;
  providerName: string;
  providerStatus: string;
  providerInstitutionId: string;
  providerInstitutionAlternateId: string | null;
  providerInstitutionSecondaryReference: string | null;
  providerInstitutionName: string | null;
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
