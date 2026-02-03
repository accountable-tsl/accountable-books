import express from 'express';

import { getPeriodStatusController } from './period-status.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/period-status', getPeriodStatusController);

export default router;
