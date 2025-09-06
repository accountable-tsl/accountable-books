import type { Knex } from 'knex';
import { errorResponse, successResponse } from '../../shared/utils/response.utils.js';
import { knexClient } from '../../db/knexClient.js';
import { type ApiResponse } from '../../core/types/api.types.js';
import {
  bankAccountConnectionInputCamel,
  type BankAccountConnectionInput,
} from './baccons.types.js';

export const addNewBankAccountConnectionEntry = async ({
  userId,
  data,
  trx,
}: {
  userId: string;
  data: BankAccountConnectionInput;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ id: string; created: boolean }>> => {
  // validate input
  const parsed = bankAccountConnectionInputCamel.safeParse(data);
  if (!parsed.success) {
    return errorResponse('Invalid input provided', parsed.error.flatten());
  }
  const v = parsed.data;

  const execute = async (k: Knex.Transaction) => {
    const rows = await k('bank_account_connections')
      .insert({
        provider_bank_account_id: v.provider_bank_account_id,
        provider_bank_account_secondary_id: v.provider_bank_account_secondary_id ?? null,
        bank_account_id: v.bank_account_id ?? null,
        provider_id: v.provider_id,
        company_bank_credential_id: v.company_bank_credential_id,
        status: v.status,
        ...(v.raw_metadata ? { raw_metadata: v.raw_metadata } : {}),
        created_by_id: userId,
      })
      .onConflict(['provider_id', 'provider_bank_account_id'])
      .ignore()
      .returning<{ id: string }[]>('id');

    if (rows.length) {
      return successResponse('Bank account connection created', { id: rows[0].id, created: true });
    }

    const existing = await k('bank_account_connections')
      .where({
        provider_id: v.provider_id,
        provider_bank_account_id: v.provider_bank_account_id,
      })
      .first<{ id: string }>('id');

    if (!existing) {
      return errorResponse('Conflict detected but existing id not found');
    }

    return successResponse('Connection exists; returned existing id', {
      id: existing.id,
      created: false,
    });
  };

  try {
    const result = trx ? await execute(trx) : await knexClient.transaction(execute);
    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to create bank account connection');
    }
    return result;
  } catch (error) {
    return errorResponse('Failed to create bank account connection', error);
  }
};
