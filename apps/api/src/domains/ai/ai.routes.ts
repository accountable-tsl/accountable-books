import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import { basicLimiter } from '../../core/middlewares/rateLimiter.middleware.js';
import { chatAiController } from './ai.chat.controller.js';
import {
  executeApprovalController,
  rejectApprovalController,
} from './approvals/approvals.controller.js';

const router = express.Router({ mergeParams: true });

// AI endpoints can be expensive; keep a conservative limiter by default.
router.use(basicLimiter);

router.post('/chat', checkCompanyId, chatAiController);

// Deterministic approval execution endpoints (no LLM re-entry).
router.post('/approvals/:approvalId/execute', executeApprovalController);
router.post('/approvals/:approvalId/reject', rejectApprovalController);

export default router;
