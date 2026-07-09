import type { Response } from 'express';

import { errorResponse, successResponse } from '../../shared/utils/index.js';
import { getLogger } from '../../shared/utils/logger.js';
import { getWorkQueue } from './work-queue.read.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';

const logger = getLogger({ component: 'work-queue-controller' });

function getRequestCompanyId(req: AuthRequest): string {
  const companyId = req.companyContext?.uuid ?? req.company?.id;
  if (!companyId) {
    throw new Error('Authenticated company context is required');
  }
  return companyId;
}

function getRequestUserId(req: AuthRequest): string {
  const userId = req.user?.id;
  if (!userId) {
    throw new Error('Authenticated user is required');
  }
  return userId;
}

/**
 * Firm-scoped read of the materialized work queue. `:companyId` is the firm
 * workspace; the response groups `categorize_transactions` work with exact
 * subjects so the UI can deep-link categorization to those transactions.
 */
export async function getWorkQueueController(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const firmCompanyId = getRequestCompanyId(req);
    const queue = await getWorkQueue({
      firmCompanyId,
      viewer: {
        userId: getRequestUserId(req),
        roleKey: req.company?.roleKey ?? null,
        roleScope: req.company?.roleScope ?? null,
        accessOrigin: req.company?.accessOrigin ?? null,
      },
    });
    return res.status(200).json(successResponse('Work queue retrieved', queue));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message === 'Authenticated company context is required' ||
      message === 'Authenticated user is required'
    ) {
      return res.status(401).json(errorResponse(message));
    }
    logger.error({ error: message }, 'Failed to retrieve work queue');
    return res.status(500).json(errorResponse('Failed to retrieve work queue'));
  }
}
