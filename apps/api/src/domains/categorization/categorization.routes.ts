import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import { getCategorizationTransactionsController } from './categorization.controller.js';

const router = express.Router({ mergeParams: true });

/**
 * GET /api/:companyId/categorization/transactions
 *
 * Query parameters:
 * - dateFrom (required): Start date in YYYY-MM-DD format
 * - dateTo (required): End date in YYYY-MM-DD format
 * - status (optional): Filter by status ('uncategorized' | 'proposed' | 'posted')
 * - limit (optional): Number of records to return (default: 100, max: 1000)
 * - offset (optional): Number of records to skip (default: 0)
 *
 * Returns categorization transactions from the unified view
 */
router.get(
  '/transactions',
  checkCompanyId,
  getCategorizationTransactionsController,
);

export default router;
