import type { Knex } from 'knex';
import z from 'zod';

import type { ApiResponse } from '../../core/types/api.types.js';
import { knexClient } from '../../db/knexClient.js';
import { redis } from '../../lib/redis.js';
import { generateChecksum, logger } from '../../shared/index.js';
import {
  camelToSnake,
  removeNullsShallow,
} from '../../shared/utils/formatting.utils.js';
import { chunkArray, getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  AppError,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  getAccountTypeByKey,
  getFullAccountMeta,
} from '../account/account.registry.js';
import { invalidateCompanyContext } from '../categorization/index.js';
import { DEFAULT_ACCOUNT_TYPE_IDS, mustHaveAccounts } from './coa.constants.js';
import {
  type Coa,
  type CoaResponse,
  type CoaSnapshotVersion,
  type CoaUpdateInput,
  coaUpdateInput,
  type CoaUpdateOptions,
  type CoaValidationResponse,
  type CoaValidationResult,
  type CoaValidationStatus,
  type FetchCoaInput,
  type NewCoa,
  newCoa,
  newCoaInput,
  type NewCoaInputCamel,
  type ResolvedCoaUpdateInput,
  type SimpleCoaRecord,
  type UpdateCoaAction,
  updateCoaAction,
  type UpdateCoaResponse,
} from './coa.types.js';

// TODO: Invalidate coa cache on mutations
const coaCacheTTL = 60 * 60 * 2;

const generateCoaCacheKey = ({ companyUUID }: { companyUUID: string }) =>
  `coa:v1:${companyUUID}`;

async function invalidateCoaCache({ companyUUID }: { companyUUID: string }) {
  const cacheKey = generateCoaCacheKey({ companyUUID });
  await redis.del(cacheKey);
}

async function invalidateAllCoaCaches({
  companyUUID,
}: {
  companyUUID: string;
}) {
  await invalidateCoaCache({ companyUUID });
  await invalidateCompanyContext(companyUUID);
  await invalidateCoaSnapshotCacheForML({ companyUUID });
}

/**
 * Validate input
 * Get the company's UUID
 * Get the company's reporting currency
 * Get account type ids for all coa records, we receive keys as input
 * All good? insert data into coa
 *
 * Any bad data, return error
 * This should not be used for the creation of bank accounts coa
 * @param param0
 * @returns
 */

export const createCoa = async ({
  data,
  userId,
  companyId,
  trx,
}: {
  data: NewCoaInputCamel[];
  userId: string;
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ coaIds: string[] } | null>> => {
  // Validate input
  const snakeData = camelToSnake(data);
  const validate = newCoaInput.array().safeParse(snakeData);
  if (!validate.success) {
    return errorResponse('Invalid input', validate.error?.message);
  }
  const coaRecords = validate.data;

  const query = async (tx: Knex.Transaction) => {
    const errors: string[] = [];
    const recordsToInsert: NewCoa[] = [];

    // Get company details
    const company = await tx('companies')
      .select({
        id: 'id',
        reportingCurrencyId: 'reporting_currency_id',
      })
      .where((qb) => {
        qb.where('short_code', companyId).orWhere('id', companyId);
      })
      .first();

    if (!company || !company.id || !company.reportingCurrencyId) {
      return errorResponse('Company not found');
    }

    const { id: companyUUID, reportingCurrencyId } = company;

    // Get the account type ids for all coa records, then build insert data
    const accountMeta = await getFullAccountMeta();
    const typeMap = accountMeta.accountTypesByKey;

    // Validate all account types upfront
    const missingTypes = coaRecords
      .filter((record) => !typeMap.get(record.account_type_key))
      .map((record) => record.account_type_key);

    if (missingTypes.length > 0) {
      return errorResponse('Invalid account types found', {
        invalidTypes: [...new Set(missingTypes)],
      });
    }

    // Build records to insert
    for (const record of coaRecords) {
      const type = typeMap.get(record.account_type_key);
      if (!type || !type.id) {
        errors.push(`Account type not found: ${record.account_type_key}`);
        continue;
      }

      recordsToInsert.push({
        name: record.name,
        locked: record.locked ?? false,
        source: record.source ?? 'user',
        created_by_id: userId,
        updated_by_id: userId,
        company_id: companyUUID,
        currency_id: reportingCurrencyId,
        account_type_id: type.id,
        version_seq: 1,
        ...(record.code ? { code: record.code } : {}),
        ...(record.description ? { description: record.description } : {}),
      });
    }

    if (errors.length) {
      return errorResponse('Failed to create chart of accounts', errors);
    }

    if (recordsToInsert.length === 0) {
      return errorResponse('No valid records to insert');
    }

    // Batch and insert records, returning IDs
    const batchedRecords = chunkArray(recordsToInsert, 500);
    const allInsertedIds: string[] = [];

    for (const batch of batchedRecords) {
      const insertedRecords = await tx('coa').insert(batch).returning('*');

      allInsertedIds.push(...insertedRecords.map((record) => record.id));
    }

    await updateCoaVersions({
      coaIds: allInsertedIds,
      companyUUID,
      userId,
      notes: 'coa_creation',
      trx: tx,
    });

    // Invalidate caches after successful insert
    await invalidateAllCoaCaches({ companyUUID });

    return successResponse(
      `Successfully created ${allInsertedIds.length} account${allInsertedIds.length > 1 ? 's' : ''}`,
      { coaIds: allInsertedIds },
    );
  };

  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);
    return result;
  } catch (error) {
    console.error('Error in createCoa:', error);
    return errorResponse(
      'Failed to create chart of accounts',
      error instanceof Error ? error.message : String(error),
    );
  }
};

export const createDefaultAccounts = async ({
  trx,
  companyUUID,
  userId,
  reportingCurrencyId,
}: {
  trx: Knex | Knex.Transaction;
  companyUUID: string;
  userId: string;
  reportingCurrencyId: string;
}): Promise<ApiResponse> => {
  const defaultAccounts: NewCoa[] = mustHaveAccounts.map((acc) => {
    return {
      ...acc,
      company_id: companyUUID,
      created_by_id: userId,
      currency_id: reportingCurrencyId,
      locked: true,
      source: 'template',
    };
  });

  const existingLockedAccounts = await trx('coa')
    .where({
      company_id: companyUUID,
      locked: true,
    })
    .whereIn('account_type_id', Object.values(DEFAULT_ACCOUNT_TYPE_IDS))
    .select('account_type_id');

  const existingAccountTypeIds = new Set(
    existingLockedAccounts.map((acc) => acc.account_type_id),
  );

  const accountsToCreate = defaultAccounts.filter(
    (acc) => !existingAccountTypeIds.has(acc.account_type_id),
  );

  if (!accountsToCreate.length)
    return successResponse('No accounts to create', null);

  const validatedAccounts = newCoa.array().safeParse(accountsToCreate);
  if (!validatedAccounts.success) {
    throw new AppError(
      'Failed to validate default accounts',
      z.flattenError(validatedAccounts.error),
    );
  }
  let inserted;
  if (validatedAccounts.success) {
    inserted = await trx('coa').insert(validatedAccounts.data).returning('*');
    const coaIds = inserted.map((acc) => acc.id);

    await updateCoaVersions({
      coaIds,
      companyUUID,
      userId,
      notes: 'default_coa_creation',
      trx: trx.isTransaction ? (trx as Knex.Transaction) : undefined,
    });
  }

  if (!inserted || inserted.length === 0) {
    return errorResponse('Failed to insert default chart of accounts records');
  }
  await invalidateAllCoaCaches({ companyUUID });
  return successResponse('Must-have accounts successfully inserted', inserted);
};

export const fetchCompanyCoa = async ({
  companyId: receivedCompanyId,
  ids: accountIds,
  codes: accountCodes,
  active,
  accountTypeKeys: keys,
  includeDeleted = false,
  trx,
}: FetchCoaInput): Promise<ApiResponse<CoaResponse[]>> => {
  if (!receivedCompanyId) return errorResponse('Company ID is required');

  const ids = accountIds || [];
  const codes = accountCodes || [];
  const accountTypeKeys = keys || [];

  const coaQuery = async (tx: Knex.Transaction, companyId: string) => {
    return (
      tx('coa')
        .select([
          'coa.id as id',
          'coa.code as code',
          'coa.name as name',
          'coa.description as description',
          'coa.is_active as isActive',
          'coa.locked as isLocked',
          'coa.is_deleted as isDeleted',
          'coa.source as source',

          // "at.id as accountTypeId",
          'at.key as accountTypeKey',
          'at.label as accountTypeLabel',
          'at.report_code as reportCode',
          'at.default_monetary as defaultMonetary',

          // "ae.id as accountElementId",
          'ae.key as accountElementKey',
          'ae.label as accountElementLabel',

          // "pae.id as parentAccountElementId",
          'pae.key as parentAccountElementKey',
          'pae.label as parentAccountElementLabel',

          // "cur.id as accountCurrencyId",
          'cur.code as accountCurrencyCode',
          'cur.symbol as accountCurrencySymbol',

          // "rc.id as reportingCurrencyId",
          'rc.code as reportingCurrencyCode',
          'rc.symbol as reportingCurrencySymbol',

          'fs.us_gaap_label as gaapFsLabel',
          'fs.ifrs_label as ifrsFsLabel',

          'c.reporting_framework as reportingFramework',
          tx.raw(
            `(EXISTS (SELECT 1 FROM ledger_entries WHERE coa_id = coa.id)) as "hasTransactions"`,
          ),
        ])
        .where('coa.company_id', companyId)
        .modify((qb) => {
          if (ids?.length) qb.whereIn('coa.id', ids);
          if (codes?.length) qb.whereIn('coa.code', codes);
          if (active !== undefined) qb.where('coa.is_active', active);
          if (accountTypeKeys?.length) qb.where('at.key', accountTypeKeys);
          if (includeDeleted === false)
            qb.where('coa.is_deleted', includeDeleted);
        })
        .join('account_types as at', 'coa.account_type_id', 'at.id')
        .join('account_elements as ae', 'at.account_element_id', 'ae.id')
        .leftJoin('account_elements as pae', 'ae.parent_id', 'pae.id')
        .join('currencies as cur', 'coa.currency_id', 'cur.id')
        .join('companies as c', 'coa.company_id', 'c.id')
        .join('currencies as rc', 'c.reporting_currency_id', 'rc.id')
        .join(
          'financial_statements as fs',
          'ae.financial_statement_id',
          'fs.id',
        )
        // Sort by bank accounts first, then by account code for consistent ordering
        .orderByRaw(
          'CASE WHEN coa.is_deleted = true THEN 2 ' +
            'WHEN coa.is_active = false THEN 1 ' +
            'ELSE 0 END, ' +
            "CASE WHEN at.key = 'ca_bank' THEN 0 ELSE 1 END, " +
            'at.key ASC, ' +
            'coa.code ASC',
        )
    );
  };

  const enhanceCoa = (coa: any) => ({
    ...coa,
    canDelete: !coa.isLocked && !coa.hasTransactions && !coa.isDeleted,
  });

  const query = async (trx: Knex.Transaction, companyId: string) => {
    const coa = await coaQuery(trx, companyId);
    return coa.map(enhanceCoa);
  };

  try {
    const companyUUID = await getCompanyUUID(receivedCompanyId);
    if (!companyUUID) return errorResponse('Invalid company identifier');

    const hasFilters =
      ids.length > 0 ||
      codes.length > 0 ||
      active !== undefined ||
      accountTypeKeys.length > 0;

    const cacheKey = generateCoaCacheKey({ companyUUID });

    if (!hasFilters) {
      const cached = await redis.get(cacheKey);

      if (cached) {
        try {
          const parsedData = JSON.parse(cached);
          return successResponse(
            'Successfully retrieved chart of accounts',
            parsedData,
          );
        } catch (e) {
          console.warn('Failed to parse cached COA', { cacheKey, error: e });
        }
      }
    }

    const res = trx
      ? await query(trx, companyUUID)
      : await knexClient.transaction((trx) => query(trx, companyUUID));

    const result = removeNullsShallow(res);
    if (!hasFilters && includeDeleted && result.length > 0) {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', coaCacheTTL);
    }

    return successResponse('Successfully retrieved chart of accounts', result);
  } catch (error) {
    return errorResponse('Failed to retrieve chart of accounts', error);
  }
};

/**
 * --------------------
 * Update chart of accounts
 * --------------------
 */
export const editCoa = async ({
  updates,
  companyId,
  userId,
  trx,
}: {
  updates: CoaUpdateInput[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}) => {
  return updateChartOfAccounts({
    updates,
    options: {
      companyId,
      updatedById: userId,
      operation: updateCoaAction.enum.edit,
    },
    trx,
  });
};

export const archiveCoa = async ({
  accountIds,
  companyId,
  userId,
  trx,
}: {
  accountIds: string[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}) => {
  const updates = accountIds.map(
    (id) =>
      ({
        id,
        isActive: false,
      }) satisfies CoaUpdateInput,
  );

  return updateChartOfAccounts({
    updates,
    options: {
      companyId,
      updatedById: userId,
      operation: updateCoaAction.enum.archive,
    },
    trx,
  });
};

export const unarchiveCoa = async ({
  accountIds,
  companyId,
  userId,
  trx,
}: {
  accountIds: string[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}) => {
  const updates = accountIds.map(
    (id) =>
      ({
        id,
        isActive: true,
      }) satisfies CoaUpdateInput,
  );

  return updateChartOfAccounts({
    updates,
    options: {
      companyId,
      updatedById: userId,
      operation: updateCoaAction.enum.unarchive,
    },
    trx,
  });
};

export const deleteCoa = async ({
  accountIds,
  companyId,
  userId,
  trx,
}: {
  accountIds: string[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}) => {
  const updates = accountIds.map(
    (id) =>
      ({
        id,
        isDeleted: true,
      }) satisfies CoaUpdateInput,
  );

  return updateChartOfAccounts({
    updates,
    options: {
      companyId,
      updatedById: userId,
      operation: updateCoaAction.enum.delete,
    },
    trx,
  });
};
/**
 * Update chart of accounts
 * Bulk delete is permitted
 * Bulk archive is permitted
 * Bulk unarchive is permitted
 * Bulk data edit is not permitted
 * Locked accounts cannot be archived or deleted
 * For now, coa for bank accounts cannot be archived or deleted (identified by account type key 'ca_bank')
 * Account type cannot be changed for locked accounts, and coa for bank accounts
 * Only editable fields are code, name, description, account type (conditionally)...
 * and is_active, is_deleted, for archiving and deleting as permitted by the above constraints...
 * and updated_by_id, updated_at, deleted_at for logging
 *
 * Update across companies is not permitted, so companyId is required
 * Remember to invalidate cache
 */

const updateChartOfAccounts = async ({
  updates,
  options,
  trx,
}: {
  updates: CoaUpdateInput[];
  options: CoaUpdateOptions;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<UpdateCoaResponse>> => {
  const { companyId, updatedById, operation } = options;
  // Get actual company UUID
  const companyUUID = await getCompanyUUID(companyId, trx);
  if (!companyUUID) {
    return errorResponse('Invalid company ID');
  }

  // Validate input
  const validatedInput = coaUpdateInput.array().safeParse(updates);
  if (!validatedInput.success) {
    return errorResponse(
      'Invalid input provided',
      validatedInput.error.flatten(),
    );
  }

  if (validatedInput.data.length === 0) {
    return errorResponse('No data provided for updating chart of accounts');
  }

  // Extract IDs for batch query
  const coaIds = validatedInput.data.map((item) => item.id);
  const results: UpdateCoaResponse = {
    updatedAccounts: [],
    errors: [],
  };

  const executeWithTransaction = async (
    tx: Knex.Transaction,
  ): Promise<UpdateCoaResponse> => {
    // Fetch existing COA records with account type information
    // Fetch existing COA records with account type information
    const existingCoaRecords = await tx('coa')
      .select([
        'coa.id',
        'coa.name',
        'coa.code',
        'coa.description',
        'coa.is_active as isActive',
        'coa.locked as isLocked',
        'coa.is_deleted as isDeleted',
        'coa.account_type_id as accountTypeId',
        'coa.version_seq as versionSeq',
        'at.key as accountTypeKey',
        'at.label as accountTypeLabel',
        tx.raw(
          `(EXISTS (SELECT 1 FROM ledger_entries WHERE coa_id = coa.id)) as "hasTransactions"`,
        ),
      ])
      .join('account_types as at', 'coa.account_type_id', 'at.id')
      .whereIn('coa.id', coaIds)
      .andWhere('coa.company_id', companyUUID);

    if (existingCoaRecords.length !== coaIds.length) {
      throw new Error(
        'One or more COA records not found or do not belong to this company',
      );
    }

    // Create lookup map for efficiency
    const accountMap = new Map<string, SimpleCoaRecord>();
    existingCoaRecords.forEach((acc) => accountMap.set(acc.id, acc));

    // Validate and process each update
    const validUpdates: Array<CoaUpdateInput> = [];
    for (const item of validatedInput.data) {
      const existing = accountMap.get(item.id);

      if (!existing) {
        results.errors.push({
          id: item.id,
          error: 'Account not found or not in specified company',
        });
        continue;
      }

      const newAccountType = item.accountTypeKey
        ? await getAccountTypeByKey(item.accountTypeKey)
        : undefined;

      const { accountTypeKey, ...rest } = item;
      const resolvedItem: ResolvedCoaUpdateInput = {
        ...rest,
        ...(accountTypeKey && newAccountType
          ? { accountTypeId: newAccountType.id }
          : {}),
        versionSeq: BigInt(existing.versionSeq) + BigInt(1), // Increment version sequence
      };

      const validation = validateUpdateRules({
        update: resolvedItem,
        existing,
        operation,
      });

      if (!validation.isValid) {
        results.errors.push({ id: item.id, error: validation.error });
        continue;
      }

      validUpdates.push(item);
    }

    // Perform bulk update if there are valid updates
    const hasUpdates = validUpdates.length > 0;

    if (hasUpdates) {
      await performBulkUpdate({
        validUpdates,
        updatedById,
        operation,
        companyUUID,
        trx,
      });

      results.updatedAccounts = validUpdates.map((u) => ({
        id: u.id,
        name: u.name,
      }));
    }

    return results;
  };

  try {
    const result = await (trx
      ? executeWithTransaction(trx)
      : knexClient.transaction(executeWithTransaction));

    // Only invalidate caches after a successful, committed transaction we control
    if (!trx && result.updatedAccounts.length > 0) {
      await invalidateAllCoaCaches({ companyUUID });
    }

    return successResponse('Chart of accounts updated successfully', result);
  } catch (error) {
    return errorResponse('Failed to update chart of accounts', error);
  }
};

function validateUpdateRules({
  update,
  existing,
  operation,
}: {
  update: CoaUpdateInput;
  existing: SimpleCoaRecord;
  operation: UpdateCoaAction;
}): {
  isValid: boolean;
  error: string;
} {
  // Check if account is locked for archive/delete operations
  if (
    existing.isLocked &&
    (operation === 'archive' || operation === 'delete')
  ) {
    return {
      isValid: false,
      error: 'Locked accounts cannot be archived or deleted',
    };
  }

  // Check if account has transactions for delete operation
  if (existing.hasTransactions && operation === 'delete') {
    return {
      isValid: false,
      error: 'Accounts with transactions cannot be deleted',
    };
  }

  // Check if bank account for archive/delete operations
  if (
    existing.accountTypeKey === 'ca_bank' &&
    (operation === 'archive' || operation === 'delete')
  ) {
    return {
      isValid: false,
      error: 'Bank accounts cannot be archived or deleted',
    };
  }

  // Check account type change restrictions
  const newAccountTypeKey = update?.accountTypeKey;
  const oldAccountTypeKey = existing?.accountTypeKey;

  if (newAccountTypeKey && newAccountTypeKey !== oldAccountTypeKey) {
    if (existing.isLocked) {
      return {
        isValid: false,
        error: 'Account type cannot be changed for locked accounts',
      };
    }
    if (oldAccountTypeKey === 'ca_bank') {
      return {
        isValid: false,
        error: 'Account type cannot be changed for bank accounts',
      };
    }
  }

  // TODO: Prevent change across account elements

  return { isValid: true, error: '' };
}

async function performBulkUpdate({
  validUpdates,
  updatedById,
  operation,
  companyUUID,
  trx,
}: {
  validUpdates: Array<ResolvedCoaUpdateInput>;
  updatedById: string;
  operation: UpdateCoaAction;
  companyUUID: string;
  trx?: Knex.Transaction;
}): Promise<void> {
  const now = new Date();

  const executeUpdate = async (tx: Knex.Transaction) => {
    for (const u of validUpdates) {
      const updateData: Partial<Coa> = {
        updated_by_id: updatedById,
        updated_at: now,
      };

      if (u?.code !== undefined) updateData.code = u.code;
      if (u.description !== undefined) updateData.description = u.description;
      if (u?.name !== undefined) updateData.name = u.name;
      if (u.accountTypeId !== undefined)
        updateData.account_type_id = u.accountTypeId;
      if (u.isActive !== undefined) updateData.is_active = u.isActive;
      if (u.isDeleted !== undefined) {
        updateData.is_deleted = u.isDeleted;
        if (u.isDeleted) {
          updateData.is_active = false;
          updateData.deleted_at = now;
        }
      }
      if (operation === 'delete') {
        await tx('coa').where({ id: u.id }).delete();
      } else {
        await tx('coa').where({ id: u.id }).update(updateData);
      }
    }

    // After updates, upsert coa versions
    const coaIds: string[] = validUpdates.map((u) => u.id);
    await updateCoaVersions({
      coaIds,
      companyUUID,
      userId: updatedById,
      notes: `coa_${operation}_operation`,
      trx: tx,
    });
  };

  if (trx) {
    await executeUpdate(trx);
  } else {
    await knexClient.transaction(executeUpdate);
  }
}

export async function updateCoaVersions({
  coaIds,
  companyUUID,
  notes,
  userId,
  trx,
}: {
  coaIds: string[];
  companyUUID: string;
  notes?: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<void> {
  // Upsert coa versions
  const coaVersionIds = await upsertCoaVersions({
    coaIds,
    companyUUID,
    trx,
  });

  // Upsert coa snapshot version
  const snapshotResult = await upsertCoaSnapshotVersions({
    coaVersionIds: coaVersionIds,
    companyUUID,
    notes,
    userId,
    trx,
  });

  // When running inside a caller-provided transaction, invalidate after commit
  if (trx && snapshotResult.oldSnapshotVersion !== undefined) {
    trx.on('commit', async () => {
      try {
        await invalidateCoaSnapshotCacheForML({ companyUUID });
      } catch (error) {
        logger.error(
          { error, companyUUID },
          'Failed to invalidate COA snapshot cache after transaction commit',
        );
      }
    });
  }
}

async function upsertCoaVersions({
  coaIds,
  companyUUID,
  trx,
}: {
  coaIds: string[];
  companyUUID: string;
  trx?: Knex.Transaction;
}) {
  const exec = async (tx: Knex.Transaction): Promise<string[]> => {
    const coaRecords = await tx('coa')
      .whereIn('id', coaIds)
      .andWhere('company_id', companyUUID)
      .select('*');

    if (coaRecords.length === 0) {
      throw new Error('No COA records found for versioning');
    }

    if (coaRecords.length !== coaIds.length) {
      throw new Error('Some COA records not found for versioning');
    }

    const existingVersions = await tx('coa_versions')
      .whereIn('coa_id', coaIds)
      .andWhere('effective_to', null)
      .select('*');

    const existingVersionMap = new Map(
      existingVersions.map((ev) => [ev.coa_id, ev]),
    );

    // For each coa record, check if existing version exists
    // If exists, set effective_to of existing version to now
    // Find difference between coa records and existing versions and build changeset
    // Insert new versions for all coa records
    // If existing, bump each version_seq by 1

    // Close existing versions and prepare new versions
    const newVersions = [];
    const now = new Date();
    const fieldsToCompare = [
      'code',
      'name',
      'description',
      'is_active',
      'locked',
      'source',
      'account_type_id',
      'currency_id',
      'is_deleted',
    ];

    for (const r of coaRecords) {
      const existingVersion = existingVersionMap.get(r.id);
      let changeset: Record<string, any> | null = null;
      if (existingVersion) {
        // Close existing version
        await tx('coa_versions')
          .where({ id: existingVersion.id })
          .update({ effective_to: r.updated_at });

        changeset = {};
        // Build changeset by comparing old vs new values
        for (const field of fieldsToCompare) {
          if (r[field] !== existingVersion[field]) {
            changeset[field] = { from: existingVersion[field], to: r[field] };
          }
        }
      }

      // Prepare new version record
      const { id, ...coaData } = r;
      const newVersion = {
        ...coaData,
        coa_id: id,
        version_seq: existingVersion
          ? Number(existingVersion.version_seq) + 1
          : 1,
        effective_from: existingVersion ? coaData.updated_at : now,
        effective_to: null,
        changeset,
      };

      newVersions.push(newVersion);

      // Update coa record's version_seq
      await tx('coa')
        .where({ id })
        .update({ version_seq: newVersion.version_seq });
    }

    const inserted = await tx('coa_versions')
      .insert(newVersions)
      .returning<{ id: string }[]>('id');

    return inserted.map((v) => v.id);
  };

  if (trx) {
    return await exec(trx);
  } else {
    return await knexClient.transaction(exec);
  }
}

async function upsertCoaSnapshotVersions({
  coaVersionIds,
  companyUUID,
  notes,
  userId,
  trx,
}: {
  coaVersionIds: string[];
  companyUUID: string;
  notes?: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<{ oldSnapshotVersion?: string | bigint }> {
  const checksum = generateChecksum(coaVersionIds, { sortArrays: true });

  const exec = async (tx: Knex.Transaction) => {
    // Create or update snapshot version
    const existing = await tx('coa_snapshot_versions')
      .where({ company_id: companyUUID })
      .first<CoaSnapshotVersion>();

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      ...(notes ? { notes } : {}),
    };

    if (existing) {
      const metadata = existing.metadata || {};
      const checksumHistory = Array.isArray(metadata.checksum_history)
        ? metadata.checksum_history
        : [];
      const newChecksumHistory = [
        { date_added: now, checksum },
        ...checksumHistory,
      ].slice(0, 50); // Keep only latest 50 entries

      await tx('coa_snapshot_versions')
        .where({ company_id: companyUUID, is_deleted: false })
        .update({
          ...updateData,
          snapshot_version: BigInt(existing.snapshot_version) + BigInt(1),
          checksum,
          metadata: {
            ...metadata,
            checksum_history: newChecksumHistory,
            last_updated: now, // Track last update
          },
          updated_by_id: userId,
        });

      // Return old version to invalidate after transaction commits
      return { oldSnapshotVersion: existing.snapshot_version };
    } else {
      await tx('coa_snapshot_versions').insert({
        company_id: companyUUID,
        snapshot_version: BigInt(1),
        checksum,
        ...updateData,
        metadata: {
          checksum_history: [{ date_added: now, checksum }],
          created_at: now, // Track creation
        },
        created_by_id: userId,
        updated_by_id: userId,
      });
      return { oldSnapshotVersion: undefined };
    }
  };

  if (trx) {
    return await exec(trx);
  } else {
    const result = await knexClient.transaction(exec);
    // Invalidate cache after transaction commits
    await invalidateCoaSnapshotCacheForML({ companyUUID });
    return result;
  }
}

/**
 * Generate Redis cache key for COA snapshot (for ML Engine)
 */
function generateCoaSnapshotCacheKey(
  companyUUID: string,
  snapshotVersion: string | bigint,
): string {
  return `coa:snapshot:${companyUUID}:${snapshotVersion}`;
}

const COA_SNAPSHOT_CACHE_TTL = 60 * 60 * 24; // 24 hours

/**
 * Ensure COA snapshot is cached in Redis for ML Engine
 *
 * This function:
 * 1. Checks if COA is already cached with the given snapshot version
 * 2. If not, fetches from DB and caches it
 * 3. Uses the snapshot version from the database (deterministic)
 *
 * @param companyUUID - Company UUID
 * @param snapshotVersion - COA snapshot version (from coa_snapshot_versions table)
 */
export async function ensureCoaSnapshotCachedForML({
  companyUUID,
  snapshotVersion,
}: {
  companyUUID: string;
  snapshotVersion: string | bigint;
}): Promise<void> {
  const cacheKey = generateCoaSnapshotCacheKey(companyUUID, snapshotVersion);

  try {
    // Check if already cached
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug(
        { companyUUID, snapshotVersion, cacheKey },
        'COA snapshot cache hit for ML',
      );
      return;
    }

    // Cache miss - fetch and cache
    logger.debug(
      { companyUUID, snapshotVersion, cacheKey },
      'COA snapshot cache miss - fetching from DB for ML',
    );

    const coaResponse = await fetchCompanyCoa({
      companyId: companyUUID,
      includeDeleted: false, // ML only needs active accounts
    });

    if (!coaResponse.success || !coaResponse.data) {
      throw new Error(
        `Failed to fetch COA for company ${companyUUID}: ${coaResponse.message}`,
      );
    }

    // Cache the COA data with versioned key
    await redis.setex(
      cacheKey,
      COA_SNAPSHOT_CACHE_TTL,
      JSON.stringify(coaResponse.data),
    );

    logger.info(
      {
        companyUUID,
        snapshotVersion,
        cacheKey,
        accountCount: coaResponse.data.length ?? 0,
      },
      'COA snapshot cached for ML Engine',
    );
  } catch (error) {
    logger.error(
      {
        error,
        companyUUID,
        snapshotVersion,
        cacheKey: generateCoaSnapshotCacheKey(companyUUID, snapshotVersion),
      },
      'Failed to ensure COA snapshot cached for ML',
    );
    throw error;
  }
}

/**
 * Invalidate COA snapshot cache when COA changes
 * Called automatically when snapshot version increments
 */
export async function invalidateCoaSnapshotCacheForML({
  companyUUID,
  snapshotVersion,
}: {
  companyUUID: string;
  snapshotVersion?: string | bigint;
}): Promise<void> {
  if (snapshotVersion) {
    // Invalidate specific version
    const cacheKey = generateCoaSnapshotCacheKey(companyUUID, snapshotVersion);
    await redis.del(cacheKey);
    logger.info(
      { companyUUID, snapshotVersion },
      'COA snapshot cache invalidated for ML',
    );
  } else {
    // Invalidate all versions for company (pattern match)
    const pattern = `coa:snapshot:${companyUUID}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(
        { companyUUID, keysCount: keys.length },
        'All COA snapshot caches invalidated for ML',
      );
    }
  }
}

/**
 * Validate COA IDs and check their status
 *
 * This helper function takes one or more COA IDs and a company ID,
 * then returns detailed information about each account's existence and status.
 * Leverages fetchCompanyCoa for caching and consistent data retrieval.
 *
 * @param coaIds - Single COA ID or array of COA IDs to validate
 * @param companyId - Company ID or UUID
 * @param trx - Optional Knex transaction
 * @returns Validation response with valid/invalid accounts and their statuses
 *
 * @example
 * ```typescript
 * // Single COA ID
 * const result = await validateCoaIds({ coaIds: 'coa-uuid', companyId: 'company-uuid' });
 * if (result.success && result.data?.allValid) {
 *   console.log('All accounts are active');
 * }
 *
 * // Multiple COA IDs
 * const result = await validateCoaIds({ coaIds: ['coa-1', 'coa-2'], companyId: 'company-uuid' });
 * if (result.success) {
 *   result.data.valid.forEach(coa => console.log(`${coa.name} is ${coa.status}`));
 *   result.data.invalid.forEach(coa => console.log(`${coa.id} - ${coa.status}`));
 * }
 * ```
 */
export async function validateCoaIds({
  coaIds,
  companyId,
  trx,
}: {
  coaIds: string | string[];
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<CoaValidationResponse>> {
  try {
    // Normalize input to array
    const ids = Array.isArray(coaIds) ? coaIds : [coaIds];

    if (ids.length === 0) {
      return errorResponse('No COA IDs provided');
    }

    // Fetch COA records using existing function (with caching, etc.)
    const coaResponse = await fetchCompanyCoa({
      companyId,
      ids,
      includeDeleted: true, // Include all statuses for validation
      trx,
    });

    if (!coaResponse.success || !coaResponse.data) {
      return errorResponse(
        'Failed to fetch COA records',
        coaResponse.message || 'Unknown error',
      );
    }

    // Create a map of found records and track which IDs were found
    const foundMap = new Map<string, CoaResponse>();
    coaResponse.data.forEach((record) => foundMap.set(record.id, record));

    const requestedIds = new Set(ids);
    const valid: CoaValidationResult[] = [];
    const invalid: CoaValidationResult[] = [];

    // Process each requested ID
    for (const id of requestedIds) {
      const record = foundMap.get(id);

      if (!record) {
        // Account not found
        invalid.push({
          id,
          exists: false,
          status: 'not_found',
        });
      } else {
        // Determine status
        let status: CoaValidationStatus;
        if (record.isDeleted) {
          status = 'deleted';
        } else if (!record.isActive) {
          status = 'inactive';
        } else {
          status = 'active';
        }

        const validationResult: CoaValidationResult = {
          id: record.id,
          exists: true,
          status,
          name: record.name,
          code: record.code,
          isLocked: record.isLocked,
          accountTypeKey: record.accountTypeKey,
        };

        // Categorize as valid (active) or invalid (inactive/deleted)
        if (status === 'active') {
          valid.push(validationResult);
        } else {
          invalid.push(validationResult);
        }
      }
    }

    const response: CoaValidationResponse = {
      valid,
      invalid,
      allValid: invalid.length === 0,
    };

    return successResponse('COA validation completed', response);
  } catch (error) {
    return errorResponse(
      'Failed to validate COA IDs',
      error instanceof Error ? error.message : String(error),
    );
  }
}
