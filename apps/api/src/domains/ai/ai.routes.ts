import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import { basicLimiter } from '../../core/middlewares/rateLimiter.middleware.js';
import { chatAiController } from './ai.chat.controller.js';
import {
  createThreadController,
  getThreadMessagesController,
  listThreadsController,
} from './ai.threads.controller.js';
import {
  executeApprovalController,
  rejectApprovalController,
} from './approvals/approvals.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

// Chat generations are expensive; keep limiter on chat only.
router.post('/chat', basicLimiter, chatAiController);

router.get('/threads', listThreadsController);
router.post('/threads', createThreadController);
router.get('/threads/:threadId/messages', getThreadMessagesController);

// Deterministic approval execution endpoints (no LLM re-entry).
router.post('/approvals/:approvalId/execute', executeApprovalController);
router.post('/approvals/:approvalId/reject', rejectApprovalController);

export default router;
