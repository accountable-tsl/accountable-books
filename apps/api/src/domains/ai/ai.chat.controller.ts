import type { Response } from 'express';
import { apiChatRequest } from '@accountable-books/contracts/schema';

import { logger } from '../../shared/index.js';
import { respondWithAssistantText, streamChat } from './ai.chat.service.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';

export async function chatAiController(req: AuthRequest, res: Response) {
  const userId = req.user?.id;
  const companyId = req.companyContext?.uuid;

  if (!userId || !companyId) {
    return respondWithAssistantText(res, 'Missing user or company context.');
  }

  const parsed = apiChatRequest.safeParse(req.body ?? {});
  if (!parsed.success) {
    logger.warn(
      {
        userId,
        companyId,
        issues: parsed.error.flatten(),
        keys:
          req.body && typeof req.body === 'object'
            ? Object.keys(req.body as any)
            : undefined,
      },
      'AI chat: invalid request body',
    );
    return respondWithAssistantText(
      res,
      "We couldn't process that request. Please try again.",
    );
  }

  await streamChat({
    companyId,
    userId,
    body: parsed.data,
    res,
    req,
  });
}
