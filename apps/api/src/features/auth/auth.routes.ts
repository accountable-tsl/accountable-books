import express from 'express';

import { authLimiter } from '../../core/middlewares/rateLimiter.middleware.js';
import {
  loginController,
  logoutController,
  meController,
  refreshTokenController,
  resendVerEmailController,
  verifyEmailController,
} from './auth.controller.js';
import { verifyRefreshToken, verifySessionToken } from './auth.middleware.js';
import { csrfProtection, generateCsrfToken } from './auth.utils.js';

const router = express.Router({ mergeParams: true });

// router.post('/login', loginController);
router.post('/login', authLimiter, loginController);
router.post('/refresh', verifyRefreshToken, refreshTokenController);
router.get('/me', verifySessionToken, csrfProtection, meController);
router.post('/logout', verifySessionToken, logoutController);
router.post('/verify-email', verifyEmailController);
router.post(
  '/resend-verification',
  verifySessionToken,
  resendVerEmailController,
);

router.get('/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});

export default router;
