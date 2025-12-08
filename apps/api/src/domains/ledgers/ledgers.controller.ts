import { type Response } from 'express';

import type { AuthRequest } from '../../features/auth/auth.types.js';
import { logger } from '../../shared/index.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import { updateOrCreateLedger } from './ledgers.model.js';
import {
  type NewLedgerTransactionData,
  newLedgerTransactionData,
  type UpdateOrCreateLedgerInput,
} from './ledgers.types.js';

/**
 * Update or create ledger transactions
 *
 * This endpoint intelligently handles:
 * - Creating new ledger transactions from bank transactions or manual journals
 * - Updating metadata in-place (description, reference, notes, etc.)
 * - Superseding transactions for accounting changes (COA, amounts, splits, etc.)
 *
 * Supports batch operations (array of transactions) or single transaction operations.
 *
 * Route: PUT/PATCH /api/:companyId/ledgers
 */
export const updateOrCreateLedgerController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const companyId = req.params.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return res
        .status(401)
        .json(errorResponse('Unauthorized: Missing company ID or user ID'));
    }

    // Support both single transaction and batch operations
    const body = req.body;
    const isArray = Array.isArray(body);
    const transactions = isArray ? body : [body];

    if (transactions.length === 0) {
      return res
        .status(400)
        .json(errorResponse('At least one transaction is required'));
    }

    // Validate each transaction using Zod schema (partial validation for updates)
    const validatedTransactions: Partial<NewLedgerTransactionData>[] = [];
    const validationErrors: Array<{ index: number; errors: any }> = [];

    for (let i = 0; i < transactions.length; i++) {
      const txn = transactions[i]!;

      // For updates, we allow partial data, so we validate what's provided
      // The schema validation will happen in the model layer for complete transactions
      // Here we just ensure basic structure is correct
      const partialValidation = newLedgerTransactionData
        .partial()
        .safeParse(txn);

      if (!partialValidation.success) {
        validationErrors.push({
          index: i,
          errors: partialValidation.error.format(),
        });
        continue;
      }

      validatedTransactions.push(partialValidation.data);
    }

    if (validationErrors.length > 0) {
      logger.warn(
        {
          companyId,
          userId,
          validationErrorCount: validationErrors.length,
        },
        'Ledger transaction validation errors',
      );

      return res.status(400).json(
        errorResponse('Validation errors in transaction data', {
          validationErrors,
          totalTransactions: transactions.length,
          validTransactions: validatedTransactions.length,
        }),
      );
    }

    // Call the model function
    const result = await updateOrCreateLedger({
      data: validatedTransactions,
      companyId,
      userId,
      trx: undefined, // Let the model create its own transaction
    });

    if (!result.success) {
      logger.error(
        {
          companyId,
          userId,
          transactionCount: validatedTransactions.length,
          error: result.error,
        },
        'Failed to update or create ledger transactions',
      );

      return res.status(400).json(result);
    }

    // Return appropriate status code based on operations performed
    const operations = result.data?.map((r) => r.operation) || [];
    const hasCreated = operations.includes('created');
    const hasSuperseded = operations.includes('superseded');

    // 201 for new resources, 200 for updates
    const statusCode = hasCreated && !hasSuperseded ? 201 : 200;

    logger.info(
      {
        companyId,
        userId,
        transactionCount: validatedTransactions.length,
        operations: operations.reduce(
          (acc, op) => {
            acc[op] = (acc[op] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      'Successfully processed ledger transactions',
    );

    // Return array for batch, single object for single request
    const responseData = isArray ? result.data : result.data?.[0];

    return res.status(statusCode).json({
      ...result,
      data: responseData,
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        companyId: req.params.companyId,
        userId: req.user?.id,
      },
      'Unexpected error in updateOrCreateLedgerController',
    );

    return res
      .status(500)
      .json(
        errorResponse(
          'An unexpected error occurred while processing ledger transactions',
          error instanceof Error ? error.message : 'Unknown error',
        ),
      );
  }
};
