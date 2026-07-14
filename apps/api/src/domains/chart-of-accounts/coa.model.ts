import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { redis } from '../../lib/redis.js';
import { runAfterTransactionCommit } from '../../shared/db/after-transaction-commit.js';
import { generateChecksum, logger } from '../../shared/index.js';
import {
  acquireAdvisoryXactLocks,
  lockKeyCompany,
} from '../../shared/services/advisoryLocks.service.js';
import {
  camelToSnake,
  getIdentifierType,
  removeNullsShallow,
} from '../../shared/utils/formatting.utils.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  AppError,
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { getAccountTypeByKey } from '../account/account.registry.js';
import { invalidateCompanyContext } from '../categorization/enrichment/company-context.service.js';
import {
  inspectCoaLifecycleImpacts,
  invalidateCoaDerivedData,
} from './coa-lifecycle-impact.service.js';
import { MUST_HAVE_ACCOUNTS } from './coa.constants.js';
import { coaUpdateInput, newCoaInput, updateCoaAction } from './coa.types.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type {
  Coa,
  CoaLifecycleWarning,
  CoaResponse,
  CoaSnapshotVersion,
  CoaUpdateInput,
  CoaUpdateOptions,
  CoaValidationResponse,
  CoaValidationResult,
  CoaValidationStatus,
  FetchCoaInput,
  NewCoaInput,
  NewCoaInputCamel,
  ResolvedCoaUpdateInput,
  SimpleCoaRecord,
  UpdateCoaAction,
  UpdateCoaResponse,
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

export type CreateCoaAccountInput = Pick<
  NewCoaInput,
  | 'name'
  | 'code'
  | 'description'
  | 'is_active'
  | 'account_type_key'
  | 'locked'
  | 'source'
>;

export type CreateCoaAccountsResult = {
  coaIds: string[];
};

/**
 * Creates COA accounts as part of a wider domain transaction.
 *
 * The COA domain owns reporting-currency resolution, account-type resolution,
 * persistence, version initialization, and cache invalidation.
 */
export async function createCoaAccounts({
  trx,
  companyId,
  userId,
  accounts,
  versionNote = 'coa_creation',
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  accounts: readonly CreateCoaAccountInput[];
  versionNote?: string;
}): Promise<CreateCoaAccountsResult> {
  if (accounts.length === 0) {
    throw new AppError(
      'At least one chart of account is required',
      undefined,
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  const validated = newCoaInput.array().safeParse([...accounts]);
  if (!validated.success) {
    throw new AppError(
      'Invalid chart of accounts input',
      validated.error,
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  const accountTypeKeys = [
    ...new Set(validated.data.map((account) => account.account_type_key)),
  ];
  const [company, accountTypes] = await Promise.all([
    trx('companies')
      .select('id', 'reporting_currency_id')
      .where(
        getIdentifierType(companyId) === 'uuid'
          ? { id: companyId }
          : { short_code: companyId },
      )
      .first<{ id: string; reporting_currency_id: string | null }>(),
    trx('account_types').select('id', 'key').whereIn('key', accountTypeKeys),
  ]);

  if (!company?.id || !company.reporting_currency_id) {
    throw new AppError(
      'Company or reporting currency not found',
      undefined,
      false,
      ErrorCode.NOT_FOUND,
    );
  }

  const accountTypeIdsByKey = new Map(
    accountTypes.map((accountType) => [accountType.key, accountType.id]),
  );
  const missingAccountTypeKeys = accountTypeKeys.filter(
    (key) => !accountTypeIdsByKey.has(key),
  );
  if (missingAccountTypeKeys.length > 0) {
    throw new AppError(
      `Account types not found: ${missingAccountTypeKeys.join(', ')}`,
      undefined,
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  const rows = validated.data.map((account) => {
    const { account_type_key: accountTypeKey, ...coaInput } = account;
    const accountTypeId = accountTypeIdsByKey.get(accountTypeKey);
    if (!accountTypeId) {
      throw new AppError(
        `Account type not found: ${accountTypeKey}`,
        undefined,
        false,
        ErrorCode.INVALID_INPUT,
      );
    }

    return {
      ...coaInput,
      company_id: company.id,
      currency_id: company.reporting_currency_id,
      account_type_id: accountTypeId,
      created_by_id: userId,
      updated_by_id: userId,
    };
  });

  const inserted = await trx('coa').insert(rows).returning<Coa[]>('*');

  if (inserted.length !== rows.length) {
    throw new AppError('Failed to create all chart of accounts');
  }

  const coaIds = inserted.map((coa) => coa.id);
  await updateCoaVersions({
    coaIds,
    companyUUID: company.id,
    userId,
    notes: versionNote,
    trx,
  });

  runAfterTransactionCommit(trx, async () => {
    try {
      await invalidateAllCoaCaches({ companyUUID: company.id });
    } catch (error) {
      logger.error(
        { error, companyId: company.id },
        'Failed to invalidate COA caches after creation',
      );
    }
  });

  return { coaIds };
}

export async function createCoaAccount({
  trx,
  companyId,
  userId,
  input,
  versionNote = 'coa_creation',
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  input: CreateCoaAccountInput;
  versionNote?: string;
}): Promise<Pick<Coa, 'id'>> {
  const { coaIds } = await createCoaAccounts({
    trx,
    companyId,
    userId,
    accounts: [input],
    versionNote,
  });

  const [id] = coaIds;
  if (!id) {
    throw new AppError('Failed to create chart of account');
  }

  return { id };
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
  const snakeData = camelToSnake(data);
  const validate = newCoaInput.array().safeParse(snakeData);
  if (!validate.success) {
    return errorResponse('Invalid input', validate.error?.message);
  }
  const query = async (tx: Knex.Transaction) => {
    const { coaIds } = await createCoaAccounts({
      trx: tx,
      companyId,
      userId,
      accounts: validate.data,
    });

    return successResponse(
      `Successfully created ${coaIds.length} account${coaIds.length > 1 ? 's' : ''}`,
      { coaIds },
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
}: {
  trx: Knex.Transaction;
  companyUUID: string;
  userId: string;
}): Promise<ApiResponse<string[] | null>> => {
  const existingLockedAccounts = await trx('coa')
    .join('account_types', 'coa.account_type_id', 'account_types.id')
    .where({
      'coa.company_id': companyUUID,
      'coa.locked': true,
      'coa.is_active': true,
      'coa.is_deleted': false,
    })
    .whereIn(
      'account_types.key',
      MUST_HAVE_ACCOUNTS.map((account) => account.account_type_key),
    )
    .select('account_types.key');

  const existingAccountTypeKeys = new Set(
    existingLockedAccounts.map((account) => account.key),
  );
  const accountsToCreate = MUST_HAVE_ACCOUNTS.filter(
    (account) => !existingAccountTypeKeys.has(account.account_type_key),
  ).map((account) => ({
    ...account,
    locked: true,
    source: 'template' as const,
  }));

  if (accountsToCreate.length === 0) {
    return successResponse('No accounts to create', null);
  }

  const { coaIds } = await createCoaAccounts({
    trx,
    companyId: companyUUID,
    userId,
    accounts: accountsToCreate,
    versionNote: 'default_coa_creation',
  });

  return successResponse('Must-have accounts successfully inserted', coaIds);
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
          tx.raw(
            `(EXISTS (
              SELECT 1
              FROM bank_accounts
              WHERE bank_accounts.coa_id = coa.id
                AND bank_accounts.is_deleted = false
            )) as "isBankLinked"`,
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
    canArchive:
      !coa.isLocked && !coa.isBankLinked && coa.isActive && !coa.isDeleted,
    canDelete:
      !coa.isLocked &&
      !coa.hasTransactions &&
      !coa.isBankLinked &&
      !coa.isDeleted,
  });

  const query = async (trx: Knex.Transaction, companyId: string) => {
    const coa = await coaQuery(trx, companyId);
    return coa.map(enhanceCoa);
  };

  try {
    const companyUUID = await getCompanyUUID(receivedCompanyId, trx);
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
 * COAs linked to active bank accounts cannot be archived or deleted.
 * Account type cannot be changed for locked or bank-linked accounts.
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

  const coaIds = validatedInput.data.map((item) => item.id);
  const duplicateIds = coaIds.filter(
    (id, index) => coaIds.indexOf(id) !== index,
  );
  if (duplicateIds.length > 0) {
    return coaUpdateRejectedResponse({
      operation,
      errors: [...new Set(duplicateIds)].map((id) => ({
        id,
        error: 'Duplicate account ID in request',
      })),
    });
  }

  const executeWithTransaction = async (
    tx: Knex.Transaction,
  ): Promise<
    | {
        rejected: true;
        errors: UpdateCoaResponse['errors'];
      }
    | {
        rejected: false;
        companyUUID: string;
        result: UpdateCoaResponse;
      }
  > => {
    const companyUUID = await getCompanyUUID(companyId, tx);

    // Lock order: company advisory lock, sorted COA rows, dependent rows,
    // then the company row used by COA snapshot versioning.
    await acquireAdvisoryXactLocks(tx, [lockKeyCompany(companyUUID)]);

    const sortedCoaIds = [...coaIds].sort();
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
        tx.raw(
          `(EXISTS (
            SELECT 1
            FROM bank_accounts
            WHERE bank_accounts.coa_id = coa.id
              AND bank_accounts.is_deleted = false
          )) as "isBankLinked"`,
        ),
      ])
      .join('account_types as at', 'coa.account_type_id', 'at.id')
      .whereIn('coa.id', sortedCoaIds)
      .andWhere('coa.company_id', companyUUID)
      .orderBy('coa.id')
      .forUpdate('coa');

    const accountMap = new Map<string, SimpleCoaRecord>();
    existingCoaRecords.forEach((acc) => accountMap.set(acc.id, acc));

    const errors: UpdateCoaResponse['errors'] = [];
    const validUpdates: ResolvedCoaUpdateInput[] = [];
    for (const item of validatedInput.data) {
      const existing = accountMap.get(item.id);

      if (!existing) {
        errors.push({
          id: item.id,
          error: 'Account not found or not in specified company',
        });
        continue;
      }

      const newAccountType = item.accountTypeKey
        ? await getAccountTypeByKey(item.accountTypeKey)
        : undefined;
      if (item.accountTypeKey && !newAccountType) {
        errors.push({
          id: item.id,
          error: `Account type not found: ${item.accountTypeKey}`,
        });
        continue;
      }

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
        newAccountTypeKey: accountTypeKey,
      });

      if (!validation.isValid) {
        errors.push({ id: item.id, error: validation.error });
        continue;
      }

      if (hasCoaChanges({ update: resolvedItem, existing, operation })) {
        validUpdates.push(resolvedItem);
      }
    }

    const lifecycleInspection =
      validUpdates.length > 0 &&
      (operation === 'archive' || operation === 'delete')
        ? await inspectCoaLifecycleImpacts({
            trx: tx,
            companyId: companyUUID,
            coaIds: validUpdates.map((update) => update.id),
          })
        : undefined;
    const warnings: CoaLifecycleWarning[] = [];

    if (lifecycleInspection) {
      for (const update of validUpdates) {
        const impact = lifecycleInspection.impactsByCoaId.get(update.id);
        if (!impact) continue;

        if (impact.bankAccounts > 0) {
          errors.push({
            id: update.id,
            error: 'Bank-linked accounts cannot be archived or deleted',
            impact,
          });
          continue;
        }

        const hasOperationalReferences =
          impact.draftJournals > 0 ||
          impact.recurringTemplates > 0 ||
          impact.categorizationRules > 0;

        if (operation === 'delete' && hasOperationalReferences) {
          errors.push({
            id: update.id,
            error: 'Account has active operational references',
            impact,
          });
        } else if (operation === 'archive' && hasOperationalReferences) {
          warnings.push({ id: update.id, impact });
        }
      }
    }

    if (errors.length > 0) {
      return { rejected: true, errors };
    }

    const invalidatedDerivedData =
      lifecycleInspection && validUpdates.length > 0
        ? await invalidateCoaDerivedData({
            trx: tx,
            inspection: lifecycleInspection,
            userId: updatedById,
          })
        : undefined;

    if (validUpdates.length > 0) {
      await performBulkUpdate({
        validUpdates,
        updatedById,
        operation,
        companyUUID,
        trx: tx,
      });
    }

    return {
      rejected: false,
      companyUUID,
      result: {
        updatedAccounts: validUpdates.map((update) => ({
          id: update.id,
          ...(update.name !== undefined ? { name: update.name } : {}),
        })),
        errors: [],
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(invalidatedDerivedData &&
        (invalidatedDerivedData.predictions > 0 ||
          invalidatedDerivedData.candidates > 0)
          ? { invalidatedDerivedData }
          : {}),
      },
    };
  };

  try {
    const outcome = await (trx
      ? executeWithTransaction(trx)
      : knexClient.transaction(executeWithTransaction));

    if (outcome.rejected) {
      return coaUpdateRejectedResponse({
        operation,
        errors: outcome.errors,
      });
    }

    // Only invalidate caches after a successful, committed transaction we control
    if (!trx && outcome.result.updatedAccounts.length > 0) {
      await invalidateAllCoaCaches({ companyUUID: outcome.companyUUID });
    }

    return successResponse(
      'Chart of accounts updated successfully',
      outcome.result,
    );
  } catch (error) {
    if (isAdvisoryLockContention(error)) {
      return coaUpdateTemporarilyBlockedResponse({ operation });
    }
    return errorResponse('Failed to update chart of accounts', error);
  }
};

function isAdvisoryLockContention(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith('Failed to acquire advisory lock:')
  );
}

function coaUpdateTemporarilyBlockedResponse({
  operation,
}: {
  operation: UpdateCoaAction;
}): ApiResponse<UpdateCoaResponse> {
  return errorResponse<UpdateCoaResponse>(
    'Chart of accounts update temporarily blocked',
    {
      operation,
      reason: 'concurrent_company_operation',
      retryable: true,
    },
    { code: ErrorCode.CONFLICT },
  );
}

function coaUpdateRejectedResponse({
  operation,
  errors,
}: {
  operation: UpdateCoaAction;
  errors: UpdateCoaResponse['errors'];
}): ApiResponse<UpdateCoaResponse> {
  return errorResponse<UpdateCoaResponse>(
    'Chart of accounts update rejected',
    { operation, errors },
    { code: ErrorCode.OPERATION_NOT_ALLOWED },
  );
}

function validateUpdateRules({
  update,
  existing,
  operation,
  newAccountTypeKey,
}: {
  update: ResolvedCoaUpdateInput;
  existing: SimpleCoaRecord;
  operation: UpdateCoaAction;
  newAccountTypeKey?: string;
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

  if (existing.isDeleted && operation === 'unarchive') {
    return {
      isValid: false,
      error: 'Deleted accounts cannot be unarchived',
    };
  }

  // Check if account has transactions for delete operation
  if (existing.hasTransactions && operation === 'delete') {
    return {
      isValid: false,
      error: 'Accounts with transactions cannot be deleted',
    };
  }

  // Check account type change restrictions
  const oldAccountTypeKey = existing?.accountTypeKey;

  if (newAccountTypeKey && newAccountTypeKey !== oldAccountTypeKey) {
    if (existing.isLocked) {
      return {
        isValid: false,
        error: 'Account type cannot be changed for locked accounts',
      };
    }
    if (existing.isBankLinked) {
      return {
        isValid: false,
        error: 'Account type cannot be changed for bank-linked accounts',
      };
    }
  }

  // TODO: Prevent change across account elements

  return { isValid: true, error: '' };
}

function hasCoaChanges({
  update,
  existing,
  operation,
}: {
  update: ResolvedCoaUpdateInput;
  existing: SimpleCoaRecord;
  operation: UpdateCoaAction;
}): boolean {
  if (operation === 'archive') return existing.isActive;
  if (operation === 'unarchive') return !existing.isActive;
  if (operation === 'delete') return !existing.isDeleted;

  return (
    (update.code !== undefined && update.code !== existing.code) ||
    (update.name !== undefined && update.name !== existing.name) ||
    (update.description !== undefined &&
      update.description !== existing.description) ||
    (update.accountTypeId !== undefined &&
      update.accountTypeId !== existing.accountTypeId) ||
    (update.isActive !== undefined && update.isActive !== existing.isActive) ||
    (update.isDeleted !== undefined && update.isDeleted !== existing.isDeleted)
  );
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
  trx: Knex.Transaction;
}): Promise<void> {
  const now = new Date();

  for (const update of validUpdates) {
    const updateData: Partial<Coa> = {
      updated_by_id: updatedById,
      updated_at: now,
    };

    if (update.code !== undefined) updateData.code = update.code;
    if (update.description !== undefined)
      updateData.description = update.description;
    if (update.name !== undefined) updateData.name = update.name;
    if (update.accountTypeId !== undefined)
      updateData.account_type_id = update.accountTypeId;
    if (update.isActive !== undefined) updateData.is_active = update.isActive;
    if (update.isDeleted !== undefined) {
      updateData.is_deleted = update.isDeleted;
      if (update.isDeleted) {
        updateData.is_active = false;
        updateData.deleted_at = now;
      }
    }
    await trx('coa').where({ id: update.id }).update(updateData);
  }

  await updateCoaVersions({
    coaIds: validUpdates.map((update) => update.id),
    companyUUID,
    userId: updatedById,
    notes: `coa_${operation}_operation`,
    trx,
  });
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
  const execute = async (tx: Knex.Transaction) => {
    // Serialize snapshot mutations per company so sequence and checksum agree.
    const company = await tx('companies')
      .where({ id: companyUUID })
      .forUpdate()
      .first<{ id: string }>('id');
    if (!company) {
      throw new Error('Company not found for COA versioning');
    }

    await upsertCoaVersions({
      coaIds,
      companyUUID,
      trx: tx,
    });

    return upsertCoaSnapshotVersions({
      companyUUID,
      notes,
      userId,
      trx: tx,
    });
  };

  if (trx) {
    const snapshotResult = await execute(trx);
    if (snapshotResult.oldSnapshotVersion === undefined) return;

    runAfterTransactionCommit(trx, async () => {
      try {
        await invalidateCoaSnapshotCacheForML({ companyUUID });
      } catch (error) {
        logger.error(
          { error, companyUUID },
          'Failed to invalidate COA snapshot cache after transaction commit',
        );
      }
    });
    return;
  }

  await knexClient.transaction(execute);
  await invalidateCoaSnapshotCacheForML({ companyUUID });
}

async function upsertCoaVersions({
  coaIds,
  companyUUID,
  trx,
}: {
  coaIds: string[];
  companyUUID: string;
  trx: Knex.Transaction;
}): Promise<void> {
  const coaRecords = await trx('coa')
    .whereIn('id', coaIds)
    .andWhere('company_id', companyUUID)
    .select('*');

  if (coaRecords.length === 0) {
    throw new Error('No COA records found for versioning');
  }

  if (coaRecords.length !== coaIds.length) {
    throw new Error('Some COA records not found for versioning');
  }

  const existingVersions = await trx('coa_versions')
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
    const versionBoundary =
      existingVersion &&
      existingVersion.effective_from &&
      new Date(r.updated_at).getTime() <
        new Date(existingVersion.effective_from).getTime()
        ? existingVersion.effective_from
        : r.updated_at;

    if (existingVersion) {
      // Close existing version
      await trx('coa_versions')
        .where({ id: existingVersion.id })
        .update({ effective_to: versionBoundary });

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
      effective_from: existingVersion ? versionBoundary : now,
      effective_to: null,
      changeset,
    };

    newVersions.push(newVersion);

    // Update coa record's version_seq
    await trx('coa')
      .where({ id })
      .update({ version_seq: newVersion.version_seq });
  }

  await trx('coa_versions').insert(newVersions);
}

async function upsertCoaSnapshotVersions({
  companyUUID,
  notes,
  userId,
  trx,
}: {
  companyUUID: string;
  notes?: string;
  userId: string;
  trx: Knex.Transaction;
}): Promise<{ oldSnapshotVersion?: string | bigint }> {
  // A snapshot checksum represents the complete current COA state.
  const currentVersions = await trx('coa_versions')
    .where({ company_id: companyUUID })
    .whereNull('effective_to')
    .select<{ id: string }[]>('id');

  if (currentVersions.length === 0) {
    throw new Error('No current COA versions found for snapshot');
  }

  const checksum = await generateChecksum(
    currentVersions.map((version) => version.id),
    { sortArrays: true },
  );

  // Create or update snapshot version
  const existing = await trx('coa_snapshot_versions')
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

    await trx('coa_snapshot_versions')
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
  }

  await trx('coa_snapshot_versions').insert({
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
