import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import {
  handleBatchReversal,
  handleTransactionDeletion,
  handleTransactionImport,
} from './bankTransactions.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

// router.get("/all", retrieveBankTransactions);
router.post('/import', handleTransactionImport);
router.post('/delete', handleTransactionDeletion);
router.post('/batches/:batchId/reverse', handleBatchReversal);

export default router;
