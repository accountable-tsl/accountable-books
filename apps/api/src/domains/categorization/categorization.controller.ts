import { type Response } from 'express';

import type { AuthRequest } from '../../features/auth/auth.types.js';
import { dateOrString } from '../../shared/utils/random.utils.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import {
  getCategorizationTransactions,
  processCategorizationIntent,
} from './categorization.model.js';
import {
  type GetCategorizationTransactionsParams,
  getCategorizationTransactionsParams,
} from './categorization.types.js';

/**
 * Controller for getting categorization transactions
 * Validates query parameters and calls the model function
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
    const { dateFrom, dateTo, status, limit, offset } = req.query;

    // Validate required date parameters
    if (!dateFrom || !dateTo) {
      res
        .status(400)
        .json(
          errorResponse(
            'dateFrom and dateTo query parameters are required (format: YYYY-MM-DD)',
          ),
        );
      return;
    }

    // Parse and validate dates using Zod schema
    const parsedDateFrom = dateOrString.safeParse(dateFrom);
    const parsedDateTo = dateOrString.safeParse(dateTo);

    if (!parsedDateFrom.success || !parsedDateTo.success) {
      res
        .status(400)
        .json(
          errorResponse(
            'Invalid date format. Use YYYY-MM-DD format for dateFrom and dateTo',
          ),
        );
      return;
    }

    // Build params object
    const params = {
      companyId,
      dateFrom: parsedDateFrom.data,
      dateTo: parsedDateTo.data,
      status: status
        ? (status as 'uncategorized' | 'proposed' | 'posted')
        : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
      offset: offset ? parseInt(String(offset), 10) : undefined,
    };

    // Validate params with Zod schema
    const validation = getCategorizationTransactionsParams.safeParse(params);
    if (!validation.success) {
      res
        .status(400)
        .json(
          errorResponse(
            `Invalid parameters: ${validation.error.issues.map((e) => e.message).join(', ')}`,
          ),
        );
      return;
    }

    // Call model function
    const response = await getCategorizationTransactions(validation.data);

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
