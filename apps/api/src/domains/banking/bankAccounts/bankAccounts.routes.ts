import express from 'express';

import { checkCompanyId } from '../../../core/middlewares/companies.middleware.js';
import {
  createBankAccountController,
  getBankAccountsForCompany,
  getBankAccountsMinimal,
  selectBankHistoryImportController,
  updateBankAccountsController,
} from './bankAccounts.controller.js';

const router = express.Router({ mergeParams: true });

router.post('/', checkCompanyId, createBankAccountController);
router.get('/', checkCompanyId, getBankAccountsForCompany);
router.get('/minimal', checkCompanyId, getBankAccountsMinimal);
router.post(
  '/:bankAccountId/history-import/select',
  checkCompanyId,
  selectBankHistoryImportController,
);
router.patch('/', checkCompanyId, updateBankAccountsController);

export default router;
