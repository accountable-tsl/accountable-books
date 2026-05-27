import express from 'express';

import { verifyAccessToken } from '../../features/auth/auth.middleware.js';
import {
  closeBreakGlassSessionController,
  createSupportGrantController,
  listSupportGrantsController,
  openBreakGlassSessionController,
  revokeSupportGrantController,
} from './support-access.controller.js';

const router = express.Router({ mergeParams: true });

router.use(verifyAccessToken);

router.get('/grants', listSupportGrantsController);
router.post('/grants', createSupportGrantController);
router.post('/grants/:grantId/revoke', revokeSupportGrantController);
router.post('/break-glass-sessions', openBreakGlassSessionController);
router.post(
  '/break-glass-sessions/:sessionId/close',
  closeBreakGlassSessionController,
);

export default router;
