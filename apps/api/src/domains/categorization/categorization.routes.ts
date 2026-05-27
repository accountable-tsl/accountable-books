import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import {
  getCategorizationStatsController,
  getCategorizationTransactionsController,
  handleCategorizationIntentController,
} from './categorization.controller.js';

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

/**
 * GET /api/:companyId/categorization/stats
 *
 * Query parameters:
 * - bankAccountIds (optional): Filter by bank account IDs
 * - dateFrom (optional): Start date in YYYY-MM-DD format (for calculating outside range stats)
 * - dateTo (optional): End date in YYYY-MM-DD format (for calculating outside range stats)
 *
 * Returns global categorization statistics independent of the current list query
 */
router.get('/stats', checkCompanyId, getCategorizationStatsController);

/**
 * POST /api/:companyId/categorization/intents
 * Body: CategorizationIntent
 */
router.post('/intents', checkCompanyId, handleCategorizationIntentController);

export default router;
