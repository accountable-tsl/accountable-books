import express from 'express';
import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import {
  createBankAccountController,
  getBankAccountsForCompany,
} from './bankAccounts.controller.js';

const router = express.Router({ mergeParams: true });

router.post('/', checkCompanyId, createBankAccountController);
router.get('/', checkCompanyId, getBankAccountsForCompany);

export default router;
