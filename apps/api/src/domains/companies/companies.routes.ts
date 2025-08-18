import express from 'express';
import {
  getCompanyController,
  switchCompanyController,
  updateCompanyController,
} from './companies.controller.js';
import { verifyAccessToken } from '../../features/auth/auth.middleware.js';
import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';

const router = express.Router({ mergeParams: true });

router.post('/switch', verifyAccessToken, checkCompanyId, switchCompanyController);

// router.get(
//   "/",
//   verifyAccessToken,
//   // requirePermission("companies:view"),
//   getCompaniesController
// );

router.get('/:companyId', verifyAccessToken, checkCompanyId, getCompanyController);

router.patch('/:companyId', checkCompanyId, updateCompanyController);

export default router;
