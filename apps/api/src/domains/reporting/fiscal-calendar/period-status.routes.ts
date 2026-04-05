import express from 'express';

import { checkCompanyId } from '../../../core/middlewares/companies.middleware.js';
import { getPeriodStatusController } from './period-status.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

router.get('/period-status', getPeriodStatusController);

export default router;
