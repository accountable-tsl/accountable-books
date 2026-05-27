import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import { verifyAccessToken } from '../../features/auth/auth.middleware.js';
import {
  getCompanyController,
  switchCompanyController,
  updateCompanyController,
} from './companies.controller.js';

const router = express.Router({ mergeParams: true });

router.post('/switch', verifyAccessToken, switchCompanyController);

// router.get(
//   "/",
//   verifyAccessToken,
//   // requirePermission("companies:view"),
//   getCompaniesController
// );

router.get(
  '/:companyId',
  verifyAccessToken,
  checkCompanyId,
  getCompanyController,
);

router.patch(
  '/:companyId',
  verifyAccessToken,
  checkCompanyId,
  updateCompanyController,
);

export default router;
