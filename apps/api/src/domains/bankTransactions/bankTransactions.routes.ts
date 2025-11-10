import express from 'express';
import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import {
  handleTransactionDeletion,
  handleTransactionImport,
} from './bankTransactions.controller.js';

const router = express.Router({ mergeParams: true });

// router.get("/all", checkCompanyId, retrieveBankTransactions);
router.post('/import', handleTransactionImport);
router.post('/delete', checkCompanyId, handleTransactionDeletion);

export default router;
