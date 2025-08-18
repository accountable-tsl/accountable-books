import express from 'express';
import { updateOnboardingStatusController } from './onboarding.controller.js';
import { verifyRefreshToken } from '../auth/auth.middleware.js';

const router = express.Router({ mergeParams: true });

router.post('/advance', verifyRefreshToken, updateOnboardingStatusController);

export default router;
