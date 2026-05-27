import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import {
  handleTransactionDeletion,
  handleTransactionImport,
} from './bankTransactions.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

// router.get("/all", retrieveBankTransactions);
router.post('/import', handleTransactionImport);
router.post('/delete', handleTransactionDeletion);

export default router;
