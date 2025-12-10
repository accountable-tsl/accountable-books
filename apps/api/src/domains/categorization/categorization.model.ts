import type { Knex } from 'knex';

import type { ApiResponse } from '../../core/types/api.types.js';
import { knexClient } from '../../db/knexClient.js';
import { toYMD } from '../../shared/utils/date.utils.js';
import { logger } from '../../shared/utils/logger.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import type {
  CategorizationTransaction,
  GetCategorizationTransactionsParams,
  GetCategorizationTransactionsResponse,
} from './categorization.types.js';

/**
 * Get categorization transactions for the categorization engine UI
 *
 * Fetches transactions from the categorization_engine_view which unifies:
 * - Uncategorized: Bank transactions without candidates or ledger entries
 * - Proposed: Transactions with candidates (not yet posted) - shows candidate lines (non-bank legs)
 * - Posted: Transactions posted to ledger - shows ledger entries (non-bank legs)
 *
 * @param params - Query parameters including required date range
 * @returns Transactions with pagination info
 */
export async function getCategorizationTransactions(
  params: GetCategorizationTransactionsParams,
): Promise<ApiResponse<GetCategorizationTransactionsResponse>> {
  const {
    companyId,
    dateFrom,
    dateTo,
    status,
    limit = 100,
    offset = 0,
  } = params;

  try {
    // Validate date range
    if (dateFrom > dateTo) {
      return errorResponse('dateFrom must be <= dateTo');
    }

    // Enforce maximum range (365 days)
    const maxRangeDays = 365;
    const rangeDays = Math.ceil(
      (dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (rangeDays > maxRangeDays) {
      return errorResponse(
        `Date range cannot exceed ${maxRangeDays} days. Requested: ${rangeDays} days`,
      );
    }

    // Enforce maximum limit
    const maxLimit = 1000;
    const actualLimit = Math.min(limit, maxLimit);

    // Resolve company UUID
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse('Invalid company ID');
    }

    // Build query
    // Convert dates to YYYY-MM-DD strings for PostgreSQL date comparison
    let query = knexClient('categorization_engine_view')
      .where('company_id', companyUUID)
      .where('date', '>=', toYMD(dateFrom))
      .where('date', '<=', toYMD(dateTo));

    // Apply status filter if provided
    if (status) {
      query = query.where('categorization_status', status);
    }

    // Get total count (before pagination)
    const countQuery = query.clone().count('* as total');
    const countResult = await countQuery.first();
    const total = Number(countResult?.total || 0);

    // Apply pagination and ordering
    const transactions = await query
      .orderBy('bank_display_name', 'asc') // Order by bank name first
      .orderBy('bank_account_id', 'asc') // Then by bank account
      .orderBy('date', 'desc')
      .orderByRaw('coa_name ASC NULLS LAST')
      .orderByRaw('contact_name ASC NULLS LAST')
      .orderByRaw('confidence DESC NULLS LAST')
      .orderBy('id') // Final tie-breaker
      .limit(actualLimit)
      .offset(offset);

    // Transform results to match TypeScript interface
    // Note: is_editable is computed directly in the VIEW using fiscal_calendar
    const transformedTransactions: CategorizationTransaction[] =
      transactions.map((tx) => {
        return {
          id: tx.id,
          date: new Date(tx.date),
          fs_date: new Date(tx.fs_date),
          bank_amount: Number(tx.bank_amount),
          description: tx.description,
          reference: tx.reference,
          contact_name: tx.contact_name,
          contact_id: tx.contact_id,
          contact_type: tx.contact_type,
          bank_account_id: tx.bank_account_id,
          bank_account_display_name: tx.bank_account_display_name,
          bank_currency_id: tx.bank_currency_id,
          bank_currency_code: tx.bank_currency_code,
          bank_id: tx.bank_id,
          bank_display_name: tx.bank_display_name,
          bank_logo: tx.bank_logo,
          coa_id: tx.coa_id,
          coa_name: tx.coa_name,
          coa_code: tx.coa_code,
          project_id: tx.project_id,
          project_name: tx.project_name,
          system_exchange_rate: Number(tx.system_exchange_rate),
          custom_exchange_rate: Number(tx.custom_exchange_rate),
          native_amount: Number(tx.native_amount),
          reporting_amount: Number(tx.reporting_amount),
          ledger_transaction_id: tx.ledger_transaction_id,
          candidate_id: tx.candidate_id,
          confidence: tx.confidence ? Number(tx.confidence) : null,
          explanation: tx.explanation,
          human_reviewed: tx.human_reviewed ?? null,
          categorization_candidate_id: tx.categorization_candidate_id ?? null,
          categorization_status: tx.categorization_status,
          company_id: tx.company_id,
          is_editable: Boolean(tx.is_editable), // Convert to boolean (VIEW returns boolean)
        };
      });

    return successResponse('Categorization transactions fetched successfully', {
      transactions: transformedTransactions,
      total,
      limit: actualLimit,
      offset,
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        companyId,
        dateFrom,
        dateTo,
      },
      'Failed to fetch categorization transactions',
    );
    return errorResponse('Failed to fetch categorization transactions', error);
  }
}
