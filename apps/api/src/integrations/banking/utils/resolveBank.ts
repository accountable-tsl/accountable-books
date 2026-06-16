import type { Knex } from 'knex';

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

const normalizeOptionalString = (
  value: string | null | undefined,
): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

function getProviderInstitutionReferences(
  institution: ProviderInstitution,
): Pick<
  NewBankProviderMapping,
  | 'provider_institution_alternate_id'
  | 'provider_institution_secondary_reference'
> {
  const routing = normalizeOptionalString(institution.bankCodes?.routing);
  const local = normalizeOptionalString(institution.bankCodes?.local);

  if (routing && local && routing !== local) {
    return {
      provider_institution_alternate_id: routing,
      provider_institution_secondary_reference: local,
    };
  }

  return {
    provider_institution_alternate_id: routing ?? local,
    provider_institution_secondary_reference: undefined,
  };
}

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
  const institutionName = institution.name.trim();
  const swiftCode = normalizeOptionalString(
    institution.bankCodes?.swift,
  )?.toUpperCase();
  const strategies = [
    () =>
      // Exact name match
      txn(tableName)
        .where({
          country_id: countryId,
          is_deleted: false,
        })
        .andWhere(function () {
          this.where('display_name', institutionName).orWhere(
            'official_name',
            institutionName,
          );
        })
        .select(selectFields)
        .first(),

    // Swift code match
    () =>
      swiftCode
        ? txn(tableName)
            .where({
              country_id: countryId,
              is_deleted: false,
              swift_code: swiftCode,
            })
            .select(selectFields)
            .first()
        : undefined,

    // Routing or local code match
    () => {
      const codes: string[] = [
        normalizeOptionalString(institution.bankCodes?.routing),
        normalizeOptionalString(institution.bankCodes?.local),
      ].filter((code): code is string => code !== undefined);

      return codes.length
        ? txn(tableName)
            .where({
              country_id: countryId,
              is_deleted: false,
            })
            .where(function () {
              this.whereIn('local_code', codes).orWhereIn(
                'alternate_identifier',
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
  providerInstitutionId: string;
  providerInstitutionName: string | null;
  bankLogoUrl: string | null;
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
      { providerKey, providerInstitutionId: institution.providerInstitutionId },
      txn,
    );

    if (existingMapping.success && existingMapping.data) {
      log.info('Existing mapping found directly.');
      const r = existingMapping.data;
      return {
        bankId: r.bankId,
        providerId: r.providerId,
        providerInstitutionId: r.providerInstitutionId,
        providerInstitutionName: r.providerInstitutionName,
        bankLogoUrl: r.bankLogoUrl,
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
      const routingCode = normalizeOptionalString(
        institution.bankCodes?.routing,
      );
      const newBankData: NewBank = {
        key: newBankKey,
        display_name: institution.name.trim(),
        official_name: institution.name.trim(),
        country_id: countryId,
        swift_code: normalizeOptionalString(
          institution.bankCodes?.swift,
        )?.toUpperCase(),
        local_code: routingCode,
        local_code_type: routingCode ? 'routing' : undefined,
        alternate_identifier: normalizeOptionalString(
          institution.bankCodes?.local,
        ),
        website: normalizeOptionalString(institution.website),
        logo_url: normalizeOptionalString(institution.logoUrl),
        created_by_id: resolvedUserId,
        updated_by_id: resolvedUserId,
      };

      const [finalBank] = await txn('banks')
        .insert(newBankData)
        .onConflict('key')
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
      bank_feed_provider_id: resolvedProviderId,
      bank_id: bankId,
      provider_institution_id: institution.providerInstitutionId,
      ...getProviderInstitutionReferences(institution),
      provider_institution_name: institution.name,
      raw_provider_data: institution.rawData,
      created_by_id: resolvedUserId,
      updated_by_id: resolvedUserId,
    };

    await txn('bank_provider_mappings')
      .insert(mappingInput)
      .onConflict(
        txn.raw(
          '(bank_feed_provider_id, provider_institution_id) WHERE is_deleted = false',
        ),
      )
      .merge({
        provider_institution_alternate_id:
          mappingInput.provider_institution_alternate_id ?? null,
        provider_institution_secondary_reference:
          mappingInput.provider_institution_secondary_reference ?? null,
        provider_institution_name: institution.name,
        raw_provider_data: institution.rawData,
        updated_by_id: resolvedUserId,
      });

    const finalMapping = await txn('bank_provider_mappings as bpm')
      .select(
        'bpm.bank_id as bankId',
        'bpm.bank_feed_provider_id as providerId',
        'bpm.provider_institution_id as providerInstitutionId',
        'bpm.provider_institution_name as providerInstitutionName',
      )
      .where({
        'bpm.bank_feed_provider_id': resolvedProviderId,
        'bpm.provider_institution_id': institution.providerInstitutionId,
        'bpm.is_deleted': false,
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
