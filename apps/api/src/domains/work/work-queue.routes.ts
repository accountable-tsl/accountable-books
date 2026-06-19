import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import { getWorkQueueController } from './work-queue.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

router.get('/work-queue', getWorkQueueController);

export default router;
