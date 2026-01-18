import { type Response } from 'express';

import type { AuthRequest } from '../../features/auth/auth.types.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import {
  getCategorizationStats,
  getCategorizationTransactions,
  processCategorizationIntent,
} from './categorization.model.js';

/**
 * Controller for getting categorization transactions
 * Normalizes query parameters and calls the model function
 */
export async function getCategorizationTransactionsController(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const companyId = String(req.company?.id || req.params.companyId);

  if (!companyId) {
    res.status(400).json(errorResponse('Company ID is required'));
    return;
  }

  try {
    // Extract and validate query parameters
    const { dateFrom, dateTo, limit, offset, searchQuery } = req.query;
    const statusParam = req.query.status;
    const bankAccountIds = req.query.bankAccountIds;
    const bankTransactionIds = req.query.bankTransactionIds;
    const bankAccountIdsArray = Array.isArray(bankAccountIds)
      ? bankAccountIds.filter((id): id is string => typeof id === 'string')
      : typeof bankAccountIds === 'string'
        ? [bankAccountIds]
        : undefined;
    const bankTransactionIdsArray = Array.isArray(bankTransactionIds)
      ? bankTransactionIds.filter((id): id is string => typeof id === 'string')
      : typeof bankTransactionIds === 'string'
        ? [bankTransactionIds]
        : undefined;
    const statusArray = Array.isArray(statusParam)
      ? statusParam.filter(
          (value): value is string => typeof value === 'string',
        )
      : typeof statusParam === 'string'
        ? [statusParam]
        : undefined;

    // Build params object
    const params = {
      companyId,
      dateFrom,
      dateTo,
      status: statusArray,
      bankAccountIds: bankAccountIdsArray,
      bankTransactionIds: bankTransactionIdsArray,
      searchQuery: typeof searchQuery === 'string' ? searchQuery : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
      offset: offset ? parseInt(String(offset), 10) : undefined,
    };

    // Call model function
    const response = await getCategorizationTransactions(params);

    // Return response
    if (response.success) {
      res.status(200).json(response);
    } else {
      res.status(400).json(response);
    }
  } catch (error: unknown) {
    res
      .status(500)
      .json(
        errorResponse(
          'An unexpected error occurred while fetching categorization transactions',
          error,
        ),
      );
  }
}

/**
 * Controller for getting categorization statistics
 * Returns global counts independent of the current list query
 */
export async function getCategorizationStatsController(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const companyId = String(req.company?.id || req.params.companyId);

  if (!companyId) {
    res.status(400).json(errorResponse('Company ID is required'));
    return;
  }

  try {
    // Extract and validate query parameters
    const { dateFrom, dateTo } = req.query;
    const bankAccountIds = req.query.bankAccountIds;
    const bankAccountIdsArray = Array.isArray(bankAccountIds)
      ? bankAccountIds.filter((id): id is string => typeof id === 'string')
      : typeof bankAccountIds === 'string'
        ? [bankAccountIds]
        : undefined;

    // Build params object
    const params = {
      companyId,
      bankAccountIds: bankAccountIdsArray,
      dateFrom: String(dateFrom),
      dateTo: String(dateTo),
    };

    // Call model function
    const response = await getCategorizationStats(params);

    // Return response
    if (response.success) {
      res.status(200).json(response);
    } else {
      res.status(400).json(response);
    }
  } catch (error: unknown) {
    res
      .status(500)
      .json(
        errorResponse(
          'An unexpected error occurred while fetching categorization stats',
          error,
        ),
      );
  }
}

/**
 * Controller for processing categorization intent
 * Validates intent and calls service function
 */
export async function handleCategorizationIntentController(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const companyId = String(req.params.companyId);
  const userId = String(req.user?.id || '');

  if (!companyId || !userId) {
    res.status(400).json(errorResponse('Bad Request'));
    return;
  }

  // Basic validation: ensure it's an array
  if (!Array.isArray(req.body)) {
    res
      .status(400)
      .json(errorResponse('Request body must be an array of intents'));
    return;
  }

  if (req.body.length === 0) {
    res.status(400).json(errorResponse('At least one intent is required'));
    return;
  }

  try {
    // Process intents
    const result = await processCategorizationIntent({
      intents: req.body,
      companyId,
      userId,
    });

    // Return response
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: unknown) {
    res
      .status(500)
      .json(
        errorResponse(
          'An unexpected error occurred while processing intent',
          error,
        ),
      );
  }
}
