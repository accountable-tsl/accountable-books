import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  type AccountClassificationMetadata,
  type AccountElementDTO,
  type AccountTypeDTO,
  type EnrichedAccountType,
  type FinancialStatementDTO,
  type ParentAccountElementDTO,
} from './account.types.js';

import type { ApiResponse } from '../../core/types/api.types.js';

// import { redis } from '../../lib/redis.js';
// import { invalidateCoaInMemoryCache } from './account.registry.js';

// TODO: Invalidate cache on mutations
// Temporarily disabled
// const baseCacheKey = "accountMeta:v1";
// const getAccountMetaCacheKey = (enriched: boolean) => {
//   return enriched ? `${baseCacheKey}:enriched` : baseCacheKey;
// };
// const CACHE_TTL = 60 * 60 * 6; // 6 hours

// export async function invalidateAccountMetaCache(): Promise<void> {
//   await redis.del(getAccountMetaCacheKey(false));
//   await redis.del(getAccountMetaCacheKey(true));
//   invalidateCoaInMemoryCache();
// }

export async function getAccountClassificationMeta({
  trx,
  includeIds = false,
}: {
  includeIds?: boolean;
  trx?: Knex.Transaction;
} = {}): Promise<ApiResponse<AccountClassificationMetadata>> {
  try {
    // const cacheKey = getAccountMetaCacheKey(enriched);
    // if (!includeIds) {
    //   const cached = await redis.get(cacheKey);
    //   if (cached) {
    //     const result = JSON.parse(cached);
    //     return successResponse(
    //       enriched
    //         ? "Enriched account classification metadata retrieved from cache"
    //         : "Account classification metadata retrieved from cache",
    //       result
    //     );
    //   }
    // }
    const fetchData = async (knex: Knex | Knex.Transaction) => {
      const [accountTypesData, accountElementsData, financialStatements] =
        await Promise.all([
          fetchAccountTypes(knex, includeIds),
          fetchAccountElements(knex, includeIds),
          fetchFinancialStatements(knex, includeIds),
        ]);

      return {
        accountTypes: accountTypesData.accountTypes,
        accountElements: accountElementsData.accountElements,
        parentAccountElements: accountElementsData.parentAccountElements,
        financialStatements,
        enrichedAccountTypes: accountTypesData.enrichedAccountTypes,
      };
    };

    const result = trx
      ? await fetchData(trx)
      : await knexClient.transaction(fetchData);

    return successResponse(
      'Account classification metadata successfully retrieved',
      result,
    );
  } catch (error) {
    return errorResponse(
      'Failed to retrieve account classification metadata',
      error,
    );
  }
}

async function fetchAccountTypes(
  knex: Knex | Knex.Transaction,
  includeIds: boolean,
): Promise<{
  accountTypes: AccountTypeDTO[];
  enrichedAccountTypes: EnrichedAccountType[];
}> {
  const rows = await knex('account_types as at')
    .innerJoin('account_elements as ae', 'at.account_element_id', 'ae.id')
    .leftJoin('account_elements as pae', 'ae.parent_id', 'pae.id')
    .innerJoin(
      'financial_statements as fs',
      'ae.financial_statement_id',
      'fs.id',
    )
    .select(
      'at.id',
      'at.key',
      'at.label',
      'at.description',
      'at.report_code as reportCode',
      'at.accrual_targets as accrualTargets',

      'ae.id as elementId',
      'ae.key as elementKey',
      'ae.description as elementDescription',
      'ae.label as elementLabel',
      'ae.default_side as defaultSide',
      'ae.report_code as elementReportCode',

      'pae.id as parentElementId',
      'pae.key as parentElementKey',
      'pae.description as parentElementDescription',
      'pae.label as parentElementLabel',
      'pae.report_code as parentElementReportCode',

      'fs.id as fsId',
      'fs.key as fsKey',
      'fs.default_label as fsLabel',
      'fs.us_gaap_label as usGaapLabel',
      'fs.ifrs_label as ifrsLabel',
    );

  const accountTypes: AccountTypeDTO[] = rows.map(
    (r) =>
      ({
        ...(includeIds ? { id: r.id } : {}),
        key: r.key,
        label: r.label,
        description: r.description,
        reportCode: r.reportCode,
        elementKey: r.elementKey,
        accrualTargets: r.accrualTargets,
      }) satisfies AccountTypeDTO,
  );

  const enrichedAccountTypes: EnrichedAccountType[] = rows.map((r) => {
    const rawElement: AccountElementDTO = {
      ...(includeIds ? { id: r.elementId } : {}),
      key: r.elementKey,
      label: r.elementLabel,
      description: r.elementDescription,
      defaultSide: r.defaultSide,
      reportCode: r.elementReportCode,
      parentElementKey: r.parentElementKey,
      financialStatementKey: r.fsKey,
    };

    const rawParent: ParentAccountElementDTO = {
      ...(includeIds ? { id: r.parentElementId } : {}),
      key: r.parentElementKey,
      label: r.parentElementLabel,
      defaultSide: r.defaultSide,
      description: r.parentElementDescription,
      reportCode: r.parentElementReportCode,
      financialStatementKey: r.fsKey,
    };

    const rawFinancialStatement: FinancialStatementDTO = {
      ...(includeIds ? { id: r.id } : {}),
      key: r.fsKey,
      defaultLabel: r.fsLabel,
      usGaapLabel: r.usGaapLabel,
      ifrsLabel: r.ifrsLabel,
    };

    return {
      key: r.key,
      label: r.label,

      elementKey: r.elementKey,
      elementLabel: r.elementLabel,

      defaultSide: r.defaultSide,

      parentElementKey: r.parentElementKey,
      parentElementLabel: r.parentElementLabel,

      financialStatementKey: r.fsKey,
      financialStatementLabel: r.fsLabel,

      reportCode: r.reportCode,
      elementReportCode: r.elementReportCode,
      parentElementReportCode: r.parentElementReportCode,

      _rawElement: rawElement,
      _rawParent: rawParent,
      _rawFinancialStatement: rawFinancialStatement,
    } satisfies EnrichedAccountType;
  });

  return { accountTypes, enrichedAccountTypes };
}

async function fetchAccountElements(
  knex: Knex | Knex.Transaction,
  includeIds: boolean,
): Promise<{
  accountElements: AccountElementDTO[];
  parentAccountElements: ParentAccountElementDTO[];
}> {
  const raw = await knex('account_elements as ae')
    .leftJoin('account_elements as pae', 'ae.parent_id', 'pae.id')
    .innerJoin(
      'financial_statements as fs',
      'ae.financial_statement_id',
      'fs.id',
    )
    .select(
      'ae.id as id',
      'ae.key as key',
      'ae.label as label',
      'ae.description as description',
      'ae.default_side as defaultSide',
      'ae.report_code as reportCode',
      'ae.parent_id as parentId',

      'pae.key as parentKey',
      'fs.key as fsKey',
    );

  const accountElements: AccountElementDTO[] = raw
    .filter((r) => !!r.parentId)
    .map(
      (r) =>
        ({
          ...(includeIds ? { id: r.id } : {}),
          key: r.key,
          label: r.label,
          description: r.description,
          reportCode: r.reportCode,
          defaultSide: r.defaultSide,
          parentElementKey: r.parentKey,
          financialStatementKey: r.fsKey,
        }) satisfies AccountElementDTO,
    );

  const parentAccountElements: ParentAccountElementDTO[] = raw
    .filter((r) => !r.parentId)
    .map(
      (r) =>
        ({
          ...(includeIds ? { id: r.id } : {}),
          key: r.key,
          label: r.label,
          description: r.description,
          reportCode: r.reportCode,
          defaultSide: r.defaultSide,
          parentElementKey: null,
          financialStatementKey: r.fsKey,
        }) satisfies ParentAccountElementDTO,
    );

  return { accountElements, parentAccountElements };
}

async function fetchFinancialStatements(
  knex: Knex | Knex.Transaction,
  includeIds: boolean,
): Promise<FinancialStatementDTO[]> {
  const rawFS = await knex('financial_statements as fs').select(
    'fs.id as id',
    'fs.key as key',
    'fs.default_label as label',
    'fs.us_gaap_label as usGaapLabel',
    'fs.ifrs_label as ifrsLabel',
  );

  const financialStatements: FinancialStatementDTO[] = rawFS.map(
    (r) =>
      ({
        ...(includeIds ? { id: r.id } : {}),
        key: r.key,
        defaultLabel: r.label,
        usGaapLabel: r.usGaapLabel,
        ifrsLabel: r.ifrsLabel,
      }) satisfies FinancialStatementDTO,
  );

  return financialStatements;
}
