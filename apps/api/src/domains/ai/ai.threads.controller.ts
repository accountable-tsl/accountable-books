import type { Response } from 'express';
import { apiCreateThreadRequest } from '@accountable-books/contracts/schema';
import { z } from 'zod';

import {
  createChatThread,
  getChatThreadById,
  getChatThreadMessages,
  getChatThreads,
} from './ai-chat-history.model.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';

export async function createThreadController(req: AuthRequest, res: Response) {
  const userId = req.user?.id;
  const companyId = req.companyContext?.uuid;

  if (!userId || !companyId) {
    return res.status(401).json({ error: 'Missing user or company context.' });
  }

  const parsed = apiCreateThreadRequest.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  try {
    const thread = await createChatThread({
      companyId,
      userId,
      title: parsed.data.title,
    });

    // We would map this to the exact Zod `aiChatThread` shape to be safe, but they naturally match.
    return res.status(201).json({
      id: thread.id,
      companyId: thread.company_id,
      userId: thread.user_id,
      firmId: thread.firm_id,
      title: thread.title,
      isDeleted: thread.is_deleted,
      lastMessageAt: thread.last_message_at?.toISOString() ?? null,
      createdAt: thread.created_at.toISOString(),
      updatedAt: thread.updated_at.toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create thread.' });
  }
}

export async function listThreadsController(req: AuthRequest, res: Response) {
  const userId = req.user?.id;
  const companyId = req.companyContext?.uuid;

  if (!userId || !companyId) {
    return res.status(401).json({ error: 'Missing user or company context.' });
  }

  try {
    // Pagination params: ?limit=50
    const limitParams = req.query.limit
      ? parseInt(String(req.query.limit), 10)
      : 50;
    const limit =
      isNaN(limitParams) || limitParams < 1 || limitParams > 100
        ? 50
        : limitParams;

    const rows = await getChatThreads({
      companyId,
      userId,
      limit,
    });

    const items = rows.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      userId: r.user_id,
      firmId: r.firm_id,
      title: r.title,
      isDeleted: r.is_deleted,
      lastMessageAt: r.last_message_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));

    return res.json({
      items,
      nextCursor: null, // Hardcoded for V1 until true cursor pagination is required
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch threads.' });
  }
}

export async function getThreadMessagesController(
  req: AuthRequest,
  res: Response,
) {
  const userId = req.user?.id;
  const companyId = req.companyContext?.uuid;
  const threadIdParsed = z.string().uuid().safeParse(req.params?.threadId);

  if (!userId || !companyId || !threadIdParsed.success) {
    return res.status(401).json({ error: 'Missing context parameters.' });
  }

  try {
    const thread = await getChatThreadById(
      threadIdParsed.data,
      companyId,
      userId,
    );
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found.' });
    }

    const limitParams = req.query.limit
      ? parseInt(String(req.query.limit), 10)
      : 100;
    const limit =
      isNaN(limitParams) || limitParams < 1 || limitParams > 200
        ? 100
        : limitParams;

    const offsetParams = req.query.offset
      ? parseInt(String(req.query.offset), 10)
      : 0;
    const offset = isNaN(offsetParams) || offsetParams < 0 ? 0 : offsetParams;

    const rows = await getChatThreadMessages({
      threadId: threadIdParsed.data,
      companyId,
      userId,
      limit,
      offset,
    });

    const items = rows.map((r) => ({
      id: r.client_message_id ?? r.id, // Prefer client message ID for UI reconciliation
      role: r.role,
      text: r.text,
      // Metadata payload parse
      meta: r.meta
        ? typeof r.meta === 'string'
          ? (() => {
              try {
                return JSON.parse(r.meta);
              } catch {
                return undefined;
              }
            })()
          : r.meta
        : undefined,
    }));

    return res.json({
      items,
      nextCursor: null, // Hardcoded for V1 until true cursor pagination is required
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch thread messages.' });
  }
}
