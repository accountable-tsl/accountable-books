import express from 'express';
import { checkCompanyId } from '../../../core/middlewares/companies.middleware.js';
import {
  createBankAccountController,
  getBankAccountsForCompany,
  updateBankAccountsController,
} from './bankAccounts.controller.js';

const router = express.Router({ mergeParams: true });

router.post('/', checkCompanyId, createBankAccountController);
router.get('/', checkCompanyId, getBankAccountsForCompany);
router.patch('/', checkCompanyId, updateBankAccountsController);

export default router;
