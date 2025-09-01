import axios from 'axios';
import { knexClient } from '../../db/knexClient.js';
import type { ApiResponse } from '../../core/types/api.types.js';
import { errorResponse, successResponse } from '../../shared/utils/response.utils.js';
import {
  type CreateBankProviderMappings,
  type MonoBankCoverage,
  type NewBankProviderMapping,
  newBankProviderMappingCamel,
} from './bankProviderMappings.types.js';
import { ENV } from '../../config/env.js';
import type { Knex } from 'knex';
import { retryAxios } from '../../shared/utils/random.utils.js';

export async function createBankProviderMappings({
  input,
  userId,
  knex = knexClient,
}: CreateBankProviderMappings): Promise<ApiResponse<{ id: string }[]>> {
  const validatedInput = newBankProviderMappingCamel
    .array()
    .safeParse(Array.isArray(input) ? input : [input]);
  if (!validatedInput.success) {
    return errorResponse('Invalid input', validatedInput.error.flatten());
  }

  const toInsert = validatedInput.data.map((mapping) => ({
    ...mapping,
    created_by_id: userId,
    updated_by_id: userId,
  }));

  try {
    const inserted = await knex('bank_provider_mappings').insert(toInsert).returning('id');

    if (!inserted.length) return errorResponse('Failed to create mapping(s)');

    return successResponse(`${inserted.length} mapping(s) successfully created`, inserted);
  } catch (error: any) {
    if (error.code === '23503') {
      return errorResponse('Foreign key constraint failed', error.detail || error);
    }

    if (error.code === '23505') {
      return errorResponse('Duplicate mapping already exists', error.detail || error.message);
    }

    return errorResponse('Unknown error occured', error);
  }
}

export async function syncMonoInstitutionsToMappingsNG(
  systemUserId: string,
  knex: Knex = knexClient,
): Promise<ApiResponse<{ created: number; updated: number; skipped: number }>> {
  const startTime = Date.now();
  let created = 0,
    updated = 0;
  const skipped = 0;

  try {
    // Validate required configuration
    const monoSecretKey = ENV.MONO_SECRET_KEY;
    if (!monoSecretKey) {
      return errorResponse('Mono secret key is required', null, {
        report: true,
      });
    }

    // Fetch Mono institutions with timeout and retry logic
    let monoInstitutionsResp: MonoBankCoverage;
    try {
      const monoResp = await retryAxios(
        () =>
          axios.get('https://api.withmono.com/v3/institutions', {
            headers: {
              Authorization: `Bearer ${monoSecretKey}`,
            },
            timeout: 10000, // 10 seconds timeout
          }),
        3,
      );
      monoInstitutionsResp = monoResp.data;
    } catch (apiError: any) {
      return errorResponse('Failed to fetch Mono institutions', apiError);
    }

    if (
      !monoInstitutionsResp ||
      monoInstitutionsResp.status !== 'successful' ||
      !monoInstitutionsResp.data
    ) {
      return errorResponse('Invalid response from Mono API', monoInstitutionsResp);
    }

    // Filter for Nigerian institutions with valid NIP codes
    const monoInstitutionsToMap = monoInstitutionsResp.data.filter(
      (inst) => inst.country?.toLowerCase() === 'ng' && inst.id && inst.institution,
    );

    if (monoInstitutionsToMap.length === 0) {
      return successResponse('No institutions to sync', {
        created,
        updated,
        skipped,
      });
    }

    // Pre-fetch required reference data
    const [provider, nigeria] = await Promise.all([
      knex('bank_feed_providers').where({ key: 'mono' }).first('id'),
      knex('countries').where({ code: 'NG' }).first('id'),
    ]);

    if (!provider) return errorResponse('Mono provider not found in database');
    if (!nigeria) return errorResponse('Nigeria country record not found');

    // Pre-fetch all Nigerian banks and existing mappings for efficient lookup
    const [allBanks, existingMappings] = await Promise.all([
      knex('banks')
        .where({ country_id: nigeria.id })
        .select('id', 'local_code', 'secondary_reference', 'key'),

      knex('bank_provider_mappings')
        .where({ provider_id: provider.id })
        .select('bank_id', 'provider_bank_id', 'id', 'provider_bank_name', 'raw_provider_data'),
    ]);

    // Create lookup maps
    const banksByLocalCode = new Map();
    const banksBySecondaryRef = new Map();
    let otherFinancialInstitutionBank: any = null;

    allBanks.forEach((bank) => {
      if (bank.local_code) {
        banksByLocalCode.set(bank.local_code, bank);
      }
      if (bank.secondary_reference) {
        banksBySecondaryRef.set(bank.secondary_reference, bank);
      }
      if (bank.key === 'ng_other_financial_institution') {
        otherFinancialInstitutionBank = bank;
      }
    });

    const existingMappingsMap = new Map();
    existingMappings.forEach((mapping) => {
      existingMappingsMap.set(mapping.provider_bank_id, mapping);
    });

    if (!otherFinancialInstitutionBank) {
      return errorResponse('Other financial institution bank not found');
    }

    // Process institutions in batches
    const BATCH_SIZE = parseInt(ENV.MONO_SYNC_BATCH_SIZE ?? '50', 10) || 50;
    for (let i = 0; i < monoInstitutionsToMap.length; i += BATCH_SIZE) {
      const batch = monoInstitutionsToMap.slice(i, i + BATCH_SIZE);

      const processInTransaction = async (trx: Knex | Knex.Transaction) => {
        const toInsert: NewBankProviderMapping[] = [];
        const toUpdate: Partial<Omit<NewBankProviderMapping, 'created_by_id'>>[] = [];

        for (const inst of batch) {
          // Simplified bank lookup
          const bank =
            banksByLocalCode.get(inst.nip_code) ||
            banksByLocalCode.get(inst.bank_code) ||
            banksBySecondaryRef.get(inst.nip_code) ||
            banksBySecondaryRef.get(inst.bank_code) ||
            otherFinancialInstitutionBank;

          const existingMapping = existingMappingsMap.get(inst.id);

          const mappingData = {
            bank_id: bank.id,
            provider_id: provider.id,
            provider_bank_id: inst.id,
            provider_alternate_id: inst.bank_code,
            provider_bank_secondary_reference: inst.nip_code,
            provider_bank_name: inst.institution,
            raw_provider_data: inst,
          };

          if (!existingMapping) {
            // New mapping
            toInsert.push({
              ...mappingData,
              created_by_id: systemUserId,
              updated_by_id: systemUserId,
            });
            created++;
          } else {
            // Always update existing records
            toUpdate.push({
              id: existingMapping.id,
              ...mappingData,
              updated_by_id: systemUserId,
            });
            updated++;
          }
        }

        // Bulk insert new mappings
        if (toInsert.length > 0) {
          await trx('bank_provider_mappings').insert(toInsert);
        }

        // Bulk update existing mappings
        for (const updateData of toUpdate) {
          const { id, ...updateFields } = updateData;
          await trx('bank_provider_mappings').where({ id }).update(updateFields);
        }
      };
      if (knex.isTransaction) {
        await processInTransaction(knex);
      } else {
        await knex.transaction(processInTransaction);
      }
    }

    const duration = Date.now() - startTime;
    const result = { created, updated, skipped };

    return successResponse(
      `Successfully synced Mono institutions: ${created} created, ${updated} updated, ${skipped} skipped`,
      result,
    );
  } catch (error: unknown) {
    return errorResponse('Error syncing Mono institutions', error);
  }
}
