import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import { updateOrCreateLedgerController } from './ledgers.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

/**
 * PUT/PATCH /api/:companyId/ledgers
 *
 * Update or create ledger transactions intelligently.
 *
 * Supports:
 * - Single transaction: { ...ledgerData }
 * - Batch operations: [{ ...ledgerData1 }, { ...ledgerData2 }]
 *
 * The endpoint automatically determines whether to:
 * - Create new transactions
 * - Update metadata in-place
 * - Supersede transactions for accounting changes
 *
 * Example request body:
 * {
 *   "transaction_source": "bank_transaction",
 *   "source_transaction_id": "uuid-here",
 *   "date": "2024-01-15",
 *   "description": "Office supplies",
 *   "transactions": [
 *     {
 *       "coa_id": "account-uuid",
 *       "source_currency_id": "currency-uuid",
 *       "source_amount": -100.00,
 *       "fs_date": "2024-01-15",
 *       "is_bank_leg": false
 *     },
 *     {
 *       "coa_id": "bank-account-uuid",
 *       "source_currency_id": "currency-uuid",
 *       "source_amount": 100.00,
 *       "fs_date": "2024-01-15",
 *       "is_bank_leg": true
 *     }
 *   ]
 * }
 */
router.put('/', updateOrCreateLedgerController);
router.patch('/', updateOrCreateLedgerController);

export default router;
