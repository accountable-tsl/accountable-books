import express from 'express';

import { checkCompanyId } from '../../../core/middlewares/companies.middleware.js';
import {
  createBankAccountController,
  getBankAccountsForCompany,
  getBankAccountsMinimal,
  resolveBankTransactionRemovedReviewController,
  resolveBankTransactionSupersededReviewController,
  resolveReplacementUnmatchedReviewController,
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
router.post(
  '/:bankAccountId/transactions/:bankTransactionId/reviews/superseded/resolve',
  checkCompanyId,
  resolveBankTransactionSupersededReviewController,
);
router.post(
  '/:bankAccountId/transactions/:bankTransactionId/reviews/removed/resolve',
  checkCompanyId,
  resolveBankTransactionRemovedReviewController,
);
router.post(
  '/:bankAccountId/transactions/:bankTransactionId/reviews/replacement-unmatched/resolve',
  checkCompanyId,
  resolveReplacementUnmatchedReviewController,
);
router.patch('/', checkCompanyId, updateBankAccountsController);

export default router;
