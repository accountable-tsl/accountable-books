import type { Response } from 'express';
import { apiChatRequest } from '@accountable-books/contracts/schema';

import { respondWithAssistantText, streamChat } from './ai.chat.service.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';

export async function chatAiController(req: AuthRequest, res: Response) {
  const userId = req.user?.id;
  const companyId = req.params.companyId;

  if (!userId || !companyId) {
    return respondWithAssistantText(res, 'Missing user or company context.');
  }

  const parsed = apiChatRequest.safeParse(req.body ?? {});
  if (!parsed.success) {
    return respondWithAssistantText(
      res,
      'Invalid request body. Please try again.',
    );
  }

  await streamChat({
    companyId: String(companyId),
    userId,
    body: parsed.data,
    res,
    req,
  });
}
