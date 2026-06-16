import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import {
  getTrialBalanceController,
  refreshTrialBalanceController,
} from './balances.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

router.get('/trial-balance', getTrialBalanceController);
router.post('/trial-balance/refresh', refreshTrialBalanceController);

export default router;
