import express from 'express';

import { checkCompanyId } from '../../../core/middlewares/companies.middleware.js';
import {
  recomputeCloseSignalsController,
  recordCloseReviewDecisionController,
} from './close-readiness.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

router.post('/close-readiness/decisions', recordCloseReviewDecisionController);
router.post(
  '/close-readiness/signals/recompute',
  recomputeCloseSignalsController,
);

export default router;
