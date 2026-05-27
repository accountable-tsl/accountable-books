import type { Knex } from 'knex';

import { ENV, isProd } from '../../../config/env.js';
import { knexClient } from '../../../db/knexClient.js';
import { getBankProviderMapping } from '../../../domains/banking/bankProviderMappings/bankProviderMappings.model.js';
import { getCountryFromCode } from '../../../domains/countries/countries.utils.js';
import { getSystemUser } from '../../../domains/users/users.model.js';
import { logger } from '../../../shared/utils/logger.js';

import type { NewBankProviderMapping } from '../../../domains/banking/bankProviderMappings/bankProviderMappings.types.js';
import type { NewBank } from '../../../domains/banking/banks/banks.types.js';
import type { ProviderInstitution } from '../types/base.js';

// --- CONFIGURATION CONSTANTS ---
const BANK_KEY_MAX_LENGTH = 100;

// --- NORMALIZATION HELPERS ---
const stripDiacritics = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Generate a standardized, unique bank key from name and country.
 */
function generateBankKey(name: string, countryCode: string): string {
  const normalizedName = stripDiacritics(name)
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Normalize multiple underscores
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores

  const key = `${countryCode.toLowerCase()}_${normalizedName}`;
  return key.substring(0, BANK_KEY_MAX_LENGTH);
}

async function getSystemUserId(txn: Knex.Transaction): Promise<string> {
  return (await getSystemUser({ trx: txn })).id;
}

async function findExistingBank({
  institution,
  countryId,
  txn,
}: {
  institution: ProviderInstitution;
  countryId: string;
  txn: Knex.Transaction;
}): Promise<{
  id: string;
  display_name: string;
  logo_url: string | null;
} | null> {
  const tableName = 'banks';
  const selectFields = ['id', 'display_name', 'logo_url'];
  const strategies = [
    () =>
      // Exact name match
      txn(tableName)
        .where({
          country_id: countryId,
          is_deleted: false,
        })
        .andWhere(function () {
          this.where('display_name', institution.name).orWhere(
            'official_name',
            institution.name,
          );
        })
        .select(selectFields)
        .first(),

    // Swift code match
    () =>
      institution.bankCodes?.swift
        ? txn(tableName)
            .where({
              country_id: countryId,
              is_deleted: false,
              swift_code: institution.bankCodes.swift,
            })
            .select(selectFields)
            .first()
        : undefined,

    // Routing or local code match
    () => {
      const codes: string[] = [
        institution.bankCodes?.routing,
        institution.bankCodes?.local,
      ].filter(
        (code): code is string => code != null && typeof code === 'string',
      );

      return codes.length
        ? txn(tableName)
            .where({
              country_id: countryId,
              is_deleted: false,
            })
            .where(function () {
              this.whereIn('local_code', codes).orWhereIn(
                'secondary_reference',
                codes,
              );
            })
            .select(selectFields)
            .first()
        : undefined;
    },
  ];

  // Try each strategy in order
  for (const [index, strategy] of strategies.entries()) {
    const result = await strategy();
    if (result) {
      logger.info(
        {
          bank_id: result.id,
          display_name: result.display_name,
          strategy: ['exact_name', 'swift_code', 'routing_code'][index],
        },
        `Bank matched using strategy ${index + 1}`,
      );
      return {
        id: result.id,
        display_name: result.display_name,
        logo_url: result.logo_url,
      };
    }
  }

  return null;
}

/**
 * Resolves bank mapping: finds existing or creates new bank + mapping
 * Priority: 1) Existing mapping, 2) Fuzzy match existing bank, 3) Create new bank
 */
export interface FindOrCreateBankMappingResponse {
  bankId: string;
  providerId: string;
  providerBankId: string;
  providerBankName: string;
  bankLogoUrl: string | null;
  // bankDisplayName: string;
  // providerKey: string;
}
export async function findOrCreateBankMapping(params: {
  providerKey: string;
  institution: ProviderInstitution;
  userId?: string;
  trx?: Knex.Transaction;
}): Promise<FindOrCreateBankMappingResponse> {
  const { providerKey, institution, userId } = params;
  const countryCode = institution.countryCode.toUpperCase();

  const log = logger.child({
    operation: 'findOrCreateBankMapping',
    providerKey,
    institutionId: institution.providerInstitutionId,
    institutionName: institution.name,
    countryCode,
  });

  const startTime = Date.now();
  log.info('Starting bank resolution');

  const exec = async (
    txn: Knex.Transaction,
  ): Promise<FindOrCreateBankMappingResponse> => {
    // Fast Path - check for existing mapping
    const existingMapping = await getBankProviderMapping(
      { providerKey, providerBankId: institution.providerInstitutionId },
      txn,
    );

    if (existingMapping.success && existingMapping.data) {
      log.info('Existing mapping found directly.');
      const r = existingMapping.data;
      return {
        bankId: r.bankId,
        providerId: r.providerId,
        providerBankId: r.providerBankId,
        providerBankName: r.providerBankName,
        bankLogoUrl: r.bankLogoUrl,
        // providerKey: r.providerKey,
        // bankDisplayName: r.bankDisplayName,
      };
    }

    // Resolve dependencies (Provider ID and User ID)
    const provider = await txn('bank_feed_providers')
      .where({ key: providerKey })
      .first('id');
    if (!provider) {
      throw new Error(`Bank feed provider ${providerKey} not found`);
    }
    const resolvedProviderId = provider.id;
    const resolvedUserId = userId || (await getSystemUserId(txn));
    const country = await getCountryFromCode(countryCode);
    const countryId = country.id;

    // Find or create the bank record.
    let bankId: string;
    let bankDisplayName: string;
    let bankLogoUrl: string | null;

    // Check for existing bank, create mapping if found
    const existingBank = await findExistingBank({
      institution,
      countryId,
      txn,
    });

    if (existingBank) {
      bankId = existingBank.id;
      bankDisplayName = existingBank.display_name;
      bankLogoUrl = existingBank.logo_url;
      log.info(`Found existing bank: ${bankDisplayName}`);
    } else {
      // No match, so we will create a new bank.
      const newBankKey = generateBankKey(institution.name, countryCode);
      const newBankData: NewBank = {
        key: newBankKey,
        display_name: institution.name,
        official_name: institution.name,
        country_id: countryId,
        swift_code: institution.bankCodes?.swift,
        local_code: institution.bankCodes?.local,
        secondary_reference: institution.bankCodes?.routing,
        website: institution.website,
        logo_url: institution.logoUrl,
        raw_data: institution.rawData,
        created_by_id: resolvedUserId,
        updated_by_id: resolvedUserId,
      };

      const [finalBank] = await txn('banks')
        .insert(newBankData)
        .onConflict(['key', 'country_id'])
        .ignore()
        .returning(['id', 'display_name', 'logo_url']);
      if (!finalBank) {
        // This should be virtually impossible if the logic is correct
        throw new Error(`Failed to create or find bank with key ${newBankKey}`);
      }

      bankId = finalBank.id;
      bankDisplayName = finalBank.display_name;
      bankLogoUrl = finalBank.logo_url || institution.logoUrl || null;
      log.info(`Created new bank: ${bankDisplayName}`);
    }

    // Create the bank provider mapping using an atomic upsert.
    const mappingInput: NewBankProviderMapping = {
      provider_id: resolvedProviderId,
      bank_id: bankId,
      provider_bank_id: institution.providerInstitutionId,
      provider_bank_name: institution.name,
      raw_provider_data: institution.rawData,
      created_by_id: resolvedUserId,
      updated_by_id: resolvedUserId,
    };

    const insertQuery = txn('bank_provider_mappings').insert(mappingInput);
    const updateQuery = txn.queryBuilder().update({
      provider_bank_name: institution.name,
      raw_provider_data: institution.rawData,
      updated_at: txn.fn.now(),
    });

    await txn.raw(`? ON CONFLICT (provider_id, provider_bank_id) DO ?`, [
      insertQuery,
      updateQuery,
    ]);

    const finalMapping = await txn('bank_provider_mappings as bpm')
      // .join('bank_feed_providers as bfp', 'bfp.id', 'bpm.provider_id')
      .select(
        'bpm.bank_id as bankId',
        'bpm.provider_id as providerId',
        'bpm.provider_bank_id as providerBankId',
        'bpm.provider_bank_name as providerBankName',
        // 'bfp.key as providerKey',
        // 'b.display_name as bankDisplayName',
      )
      // .join('banks as b', 'b.id', 'bpm.bank_id')
      .where({
        'bpm.provider_id': resolvedProviderId,
        'bpm.provider_bank_id': institution.providerInstitutionId,
      })
      .first();

    if (!finalMapping) {
      // This would indicate a serious logic error, as the upsert should guarantee its existence.
      throw new Error('Failed to retrieve the mapping after upsert operation.');
    }

    return {
      ...finalMapping,
      bankLogoUrl,
    };
  };

  try {
    const result = params.trx
      ? await exec(params.trx)
      : await knexClient.transaction(exec);
    log.info(
      { duration_ms: Date.now() - startTime },
      `Bank resolution completed successfully.`,
    );
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(
      {
        duration_ms: Date.now() - startTime,
        error: err.message,
        stack: err.stack,
      },
      'Bank resolution failed',
    );
    throw err;
  }
}
