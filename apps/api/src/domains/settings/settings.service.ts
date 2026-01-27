import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../db/knexClient.js';
import {
  errorResponse,
  getCompanyUUID,
  successResponse,
} from '../../shared/index.js';
import { settingRegistry } from './settings.registry.js';

import type { ApiResponse } from '../../core/index.js';
import type {
  SettingDefaults,
  SettingKey,
  SettingValue,
} from './settings.registry.js';

/**
 * Convert a setting value to the appropriate storage column
 * Returns an object with only the relevant column set
 */
function toStorageRow(key: SettingKey, value: unknown) {
  const schema = settingRegistry[key];
  const unwrapped = schema instanceof z.ZodDefault ? schema.unwrap() : schema;

  if (unwrapped instanceof z.ZodBoolean) {
    return { bool_value: value as boolean };
  }
  if (unwrapped instanceof z.ZodNumber) {
    return { int_value: value as number };
  }
  if (unwrapped instanceof z.ZodString) {
    return { string_value: value as string };
  }
  return { json_value: value as Record<string, unknown> };
}

/**
 * Decode value from storage row
 */
function decode(row: any) {
  return row.bool_value ?? row.int_value ?? row.string_value ?? row.json_value;
}

/**
 * Validate a setting value against its schema
 */
function validateSetting(
  key: SettingKey,
  value: unknown,
): ApiResponse<unknown> {
  const schema = settingRegistry[key];

  if (!schema) {
    return errorResponse(`Unknown setting key: ${key}`);
  }

  const result = schema.safeParse(value);

  if (!result.success) {
    return errorResponse(
      `Invalid value for setting '${key}'`,
      z.flattenError(result.error as z.ZodError),
    );
  }

  return successResponse('Valid', result.data);
}

/**
 * Retrieves company settings by keys or all settings if no keys provided
 * @param {Object} params - Parameters for the function
 * @param {string} params.companyId - The company ID to retrieve settings for
 * @param {readonly string[]} [params.settingKeys] - Array of setting keys to retrieve (omit for all)
 * @param {Knex.Transaction} [params.trx] - The knex transaction to use for the query
 * @returns {Promise<ApiResponse<Record<string, any>>>} - A promise that resolves to an ApiResponse containing the retrieved setting(s)
 */

// Overload 1: Get specific settings - returns exact subset type
export async function getCompanySetting<K extends SettingKey>(params: {
  companyId: string;
  settingKeys: readonly K[];
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ [P in K]: SettingValue<P> }>>;

// Overload 2: Get all settings - returns complete SettingDefaults type
export async function getCompanySetting(params: {
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<SettingDefaults>>;

// Implementation signature (kept generic)
export async function getCompanySetting({
  companyId,
  settingKeys,
  trx,
}: {
  companyId: string;
  settingKeys?: readonly SettingKey[];
  trx?: Knex.Transaction;
}): Promise<ApiResponse<any>> {
  const exec = async (txn: Knex.Transaction): Promise<ApiResponse<any>> => {
    const companyUUID = await getCompanyUUID(companyId, txn);
    if (!companyUUID) {
      return errorResponse('Company not found');
    }

    const query = txn('company_settings')
      .where({ company_id: companyUUID })
      .where('is_deleted', false);

    // Determine which keys to query
    const keysToFetch: SettingKey[] =
      settingKeys && settingKeys.length > 0
        ? [...settingKeys]
        : (Object.keys(settingRegistry) as SettingKey[]);

    // Filter query if specific keys requested
    if (settingKeys && settingKeys.length > 0) {
      query.whereIn('key', keysToFetch);
    }

    const rows = await query.select('*');

    // Build lookup map for O(1) access instead of O(n) .find() calls
    const rowMap = new Map(rows.map((r) => [r.key, r]));

    const output: Record<string, unknown> = {};

    if (settingKeys && settingKeys.length > 0) {
      // Specific settings requested - error if any not found
      for (const key of settingKeys) {
        const row = rowMap.get(key);
        if (!row) {
          return errorResponse(`Setting '${key}' not found for this company`);
        }
        output[key] = decode(row);
      }
    } else {
      // All settings requested - return defaults for missing
      for (const key of keysToFetch) {
        const row = rowMap.get(key);
        const schema = settingRegistry[key];
        output[key] = row ? decode(row) : schema.parse(undefined);
      }
    }

    return successResponse('Settings retrieved', output);
  };

  if (trx) {
    return exec(trx);
  } else {
    return knexClient.transaction(exec);
  }
}

// Overload: Type-safe setting update
export async function setCompanySettings<K extends SettingKey>(params: {
  companyId: string;
  settings: Array<{
    key: K;
    value: SettingValue<K>;
  }>;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ [P in K]: SettingValue<P> }>>;

// Implementation signature (kept generic)
export async function setCompanySettings({
  companyId,
  settings,
  userId,
  trx,
}: {
  companyId: string;
  settings: Array<{
    key: SettingKey;
    value: unknown;
  }>;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<any>> {
  if (!settings?.length) {
    return errorResponse('No settings provided');
  }

  const exec = async (
    txn: Knex.Transaction,
  ): Promise<ApiResponse<Record<string, unknown>>> => {
    // 1. Resolve company UUID
    const companyUUID = await getCompanyUUID(companyId, txn);
    if (!companyUUID) {
      return errorResponse('Company not found');
    }

    // 2. Validate all settings before any DB operations
    const validated = [];
    for (const setting of settings) {
      const validation = validateSetting(setting.key, setting.value);
      if (!validation.success) {
        return validation as ApiResponse<Record<string, unknown>>;
      }
      validated.push({ ...setting, value: validation.data });
    }

    // 3. Prepare rows for upsert
    const rows = validated.map((setting) => {
      const schema = settingRegistry[setting.key];

      return {
        company_id: companyUUID,
        key: setting.key,
        ...toStorageRow(setting.key, setting.value),
        created_by_id: userId,
        updated_by_id: userId,
      };
    });

    // 4. Batch upsert using onConflict pattern
    await txn('company_settings')
      .insert(rows)
      .onConflict(['company_id', 'key'])
      .merge({
        bool_value: txn.raw('excluded.bool_value'),
        int_value: txn.raw('excluded.int_value'),
        string_value: txn.raw('excluded.string_value'),
        json_value: txn.raw('excluded.json_value'),
        updated_by_id: txn.raw('excluded.updated_by_id'),
        // Note: created_by_id is NOT updated on conflict (preserves original creator)
      });

    // 5. Fetch and return the updated settings
    const keys = settings.map((s) => s.key);
    const result = await txn('company_settings')
      .where({ company_id: companyUUID })
      .whereIn('key', keys)
      .where('is_deleted', false)
      .select('*');

    const output: Record<string, unknown> = {};
    for (const row of result) {
      output[row.key] = decode(row);
    }

    return successResponse('Settings updated successfully', output);
  };

  if (trx) {
    return exec(trx);
  } else {
    return knexClient.transaction(exec);
  }
}

/**
 * Initialize default settings for a newly created company.
 * This should be called immediately after company creation.
 *
 * @param companyId - The company UUID
 * @param userId - The user ID who created the company
 * @param trx - Optional transaction to use (required when called within an existing transaction)
 * @returns ApiResponse with all initialized settings
 */
export async function initializeCompanySettings({
  companyId,
  userId,
  trx,
}: {
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<SettingDefaults>> {
  // Build default settings from registry
  const defaultSettings = (Object.keys(settingRegistry) as SettingKey[]).map(
    (key) => {
      const schema = settingRegistry[key];
      const defaultValue = schema.parse(undefined); // Extracts default value

      return {
        key,
        value: defaultValue,
      };
    },
  );

  // Use existing setCompanySettings (idempotent via onConflict)
  return setCompanySettings({
    companyId,
    settings: defaultSettings,
    userId,
    trx,
  });
}
