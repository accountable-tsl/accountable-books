import express from 'express';

import { verifyRefreshToken } from '../auth/auth.middleware.js';
import { updateOnboardingStatusController } from './onboarding.controller.js';

const router = express.Router({ mergeParams: true });

router.post('/advance', verifyRefreshToken, updateOnboardingStatusController);

export default router;
