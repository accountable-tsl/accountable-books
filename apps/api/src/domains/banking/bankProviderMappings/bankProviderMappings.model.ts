import axios from 'axios';
import type { Knex } from 'knex';

import { ENV } from '../../../config/env.js';
import type { ApiResponse } from '../../../core/types/api.types.js';
import { knexClient } from '../../../db/knexClient.js';
import { redis } from '../../../lib/redis.js';
import {
  logDatabaseOperation,
  logError,
  logger,
  logTiming,
} from '../../../shared/utils/logger.js';
import { retryAxios } from '../../../shared/utils/random.utils.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import type {
  CreateBankProviderMappings,
  GetBankProviderMappingInput,
  GetBankProviderMappingResponse,
  MonoBankCoverage,
  NewBankProviderMapping,
} from './bankProviderMappings.types.js';
import { newBankProviderMappingCamel } from './bankProviderMappings.types.js';

export async function createBankProviderMappings({
  input,
  userId,
  trx,
}: CreateBankProviderMappings): Promise<ApiResponse<{ id: string }[]>> {
  const inputArray = Array.isArray(input) ? input : [input];

  const validatedInput = newBankProviderMappingCamel
    .array()
    .safeParse(inputArray);
  if (!validatedInput.success) {
    return errorResponse<{ id: string }[]>(
      'Invalid input data',
      validatedInput.error.flatten(),
    );
  }

  const toInsert = validatedInput.data.map((mapping) => ({
    ...mapping,
    created_by_id: userId,
    updated_by_id: userId,
  }));

  const executeOperation = async (knex: Knex | Knex.Transaction) => {
    try {
      const inserted = await knex('bank_provider_mappings')
        .insert(toInsert)
        .returning('id');

      if (!inserted.length) {
        return errorResponse<{ id: string }[]>(
          'Failed to create bank provider mapping(s)',
        );
      }

      return successResponse(
        `${inserted.length} bank provider mapping(s) created successfully`,
        inserted,
      );
    } catch (error) {
      // Handle specific database constraint errors
      if (error instanceof Error && 'code' in error) {
        switch (error.code) {
          case '23503':
            return errorResponse<{ id: string }[]>(
              'Referenced bank or provider not found',
            );
          case '23505':
            return errorResponse<{ id: string }[]>(
              'Bank provider mapping already exists',
            );
          case '23502':
            return errorResponse<{ id: string }[]>('Required field is missing');
          default:
            break;
        }
      }

      logError(error instanceof Error ? error : new Error(String(error)), {
        operation: 'createBankProviderMappings',
        userId,
        recordCount: toInsert.length,
      });

      return errorResponse<{ id: string }[]>(
        'Failed to create bank provider mapping(s)',
      );
    }
  };

  if (trx) {
    return executeOperation(trx);
  }

  return knexClient.transaction(executeOperation);
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

    console.log('Starting Mono institutions sync...');

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
      return errorResponse(
        'Invalid response from Mono API',
        monoInstitutionsResp,
      );
    }

    // Filter for Nigerian institutions with valid NIP codes
    const monoInstitutionsToMap = monoInstitutionsResp.data.filter(
      (inst) =>
        inst.country?.toLowerCase() === 'ng' && inst.id && inst.institution,
    );

    console.log(
      `Found ${monoInstitutionsToMap.length} Nigerian institutions to process`,
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
        .select(
          'bank_id',
          'provider_bank_id',
          'id',
          'provider_bank_name',
          'raw_provider_data',
        ),
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
        const toUpdate: Partial<
          Omit<NewBankProviderMapping, 'created_by_id'>
        >[] = [];

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
          await trx('bank_provider_mappings')
            .where({ id })
            .update(updateFields);
        }
      };
      if (knex.isTransaction) {
        await processInTransaction(knex);
      } else {
        await knex.transaction(processInTransaction);
      }

      console.log(`Processed batch: ${batch.length} institutions`);
    }

    const duration = Date.now() - startTime;
    const result = { created, updated, skipped };

    console.log(`Sync completed in ${duration}ms:`, result);

    return successResponse(
      `Successfully synced Mono institutions: ${created} created, ${updated} updated, ${skipped} skipped`,
      result,
    );
  } catch (error: unknown) {
    return errorResponse('Error syncing Mono institutions', error);
  }
}

function generateBankProviderMappingCacheKey(
  params: GetBankProviderMappingInput,
): string {
  return `bank_provider_mapping:${JSON.stringify(params)}`;
}

/**
 * Get bank provider mapping by various criteria *
 * @param params - Search parameters
 * @param trx - Optional transaction context
 * @returns Bank provider mapping with associated bank and provider details
 */
export async function getBankProviderMapping(
  params: GetBankProviderMappingInput,
  trx?: Knex.Transaction,
): Promise<ApiResponse<GetBankProviderMappingResponse>> {
  try {
    // Extract properties with type safety - this is safer than destructuring union types
    const providerKey =
      'providerKey' in params ? params.providerKey : undefined;
    const providerId = 'providerId' in params ? params.providerId : undefined;
    const internalBankId =
      'internalBankId' in params ? params.internalBankId : undefined;
    const providerBankId =
      'providerBankId' in params ? params.providerBankId : undefined;
    const providerBankName =
      'providerBankName' in params ? params.providerBankName : undefined;
    const search = 'search' in params ? params.search : undefined;

    // Must have exactly one provider identifier
    if (!providerKey && !providerId) {
      return errorResponse(
        'Provider identification required: provide either providerKey or providerId',
      );
    }
    if (providerKey && providerId) {
      return errorResponse(
        'Cannot provide both providerKey and providerId - choose one',
      );
    }

    // Must have at least one bank identifier
    if (!internalBankId && !providerBankId) {
      return errorResponse(
        'Bank identification required: provide either internalBankId or providerBankId (or both)',
      );
    }

    const knex = trx || knexClient;
    const cacheKey = generateBankProviderMappingCacheKey(params);

    // Try cache first (only if not in transaction)
    if (!trx) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return successResponse(
            'Bank provider mapping retrieved from cache',
            JSON.parse(cached),
          );
        }
      } catch (cacheError) {
        console.warn('Cache read failed:', cacheError);
      }
    }

    // Build query with INNER JOINs for required relationships
    const query = knex('bank_provider_mappings as bpm')
      .innerJoin('banks as b', 'bpm.bank_id', 'b.id')
      .innerJoin('countries as c', 'b.country_id', 'c.id')
      .innerJoin('bank_feed_providers as bfp', 'bpm.provider_id', 'bfp.id')
      .where({
        'bpm.is_deleted': false,
        'b.is_deleted': false,
        'bfp.status': 'active',
      });

    // Apply filters
    if (providerId) {
      query.andWhere('bfp.id', providerId);
    } else {
      query.andWhere('bfp.key', providerKey);
    }

    if (internalBankId) {
      query.andWhere('bpm.bank_id', internalBankId);
    }

    if (providerBankId) {
      query.andWhere((builder) => {
        builder
          .where('bpm.provider_bank_id', providerBankId)
          .orWhere('bpm.provider_alternate_id', providerBankId)
          .orWhere('bpm.provider_bank_secondary_reference', providerBankId);
        // .orWhereRaw("bpm.raw_provider_data->>'id' = ?", [providerBankId])
        // .orWhereRaw("bpm.raw_provider_data->>'bank_code' = ?", [providerBankId])
        // .orWhereRaw("bpm.raw_provider_data->>'nip_code' = ?", [providerBankId]);
      });
    }

    if (providerBankName) {
      query.andWhere(
        'bpm.provider_bank_name',
        'ILIKE',
        `%${providerBankName}%`,
      );
    }

    if (search) {
      query.andWhere((builder) => {
        builder
          .where('bpm.provider_bank_name', 'ILIKE', `%${search}%`)
          .orWhere('b.display_name', 'ILIKE', `%${search}%`)
          .orWhere('b.official_name', 'ILIKE', `%${search}%`)
          .orWhereRaw('bpm.raw_provider_data::text ILIKE ?', [`%${search}%`]);
      });
    }

    const result = await query.first({
      bankId: 'bpm.bank_id',
      bankKey: 'b.key',
      bankLogoUrl: 'b.logo_url',
      bankDisplayName: 'b.display_name',
      bankOfficialName: 'b.official_name',
      providerId: 'bpm.provider_id',
      providerKey: 'bfp.key',
      providerName: 'bfp.name',
      providerStatus: 'bfp.status',
      providerBankId: 'bpm.provider_bank_id',
      providerAlternateId: 'bpm.provider_alternate_id',
      providerBankSecondaryReference: 'bpm.provider_bank_secondary_reference',
      providerBankName: 'bpm.provider_bank_name',
    });

    if (!result) {
      return errorResponse(
        'No bank provider mapping found for the specified criteria',
      );
    }

    // Cache successful results (only if not in transaction)
    if (!trx) {
      try {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', 3600); // 1 hour TTL
      } catch (cacheError) {
        console.warn('Cache write failed:', cacheError);
      }
    }

    return successResponse(
      'Bank provider mapping retrieved successfully',
      result,
    );
  } catch (error) {
    console.error('Error retrieving bank provider mapping:', {
      error: error instanceof Error ? error.message : String(error),
      params,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return errorResponse('Failed to retrieve bank provider mapping', error);
  }
}
