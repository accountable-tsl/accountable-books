import type { Response } from 'express';

import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import {
  executeApproval,
  getApproval,
  rejectApproval,
} from './approvals.store.js';

import type { AuthRequest } from '../../../features/auth/auth.types.js';

export async function executeApprovalController(
  req: AuthRequest,
  res: Response,
) {
  try {
    if (!req.user?.id || !req.params.companyId || !req.params.approvalId) {
      return res.status(400).json(
        errorResponse('Bad Request', undefined, {
          code: ErrorCode.INVALID_INPUT,
        }),
      );
    }

    const existing = getApproval(String(req.params.approvalId));
    if (!existing) {
      return res.status(404).json(
        errorResponse('Not Found', undefined, {
          code: ErrorCode.INVALID_INPUT,
        }),
      );
    }
    if (existing.companyId !== String(req.params.companyId)) {
      return res.status(403).json(
        errorResponse('Forbidden', undefined, {
          code: ErrorCode.OPERATION_NOT_ALLOWED,
        }),
      );
    }

    const { approval, result } = executeApproval(String(req.params.approvalId));

    return res.status(200).json(
      successResponse('Approval executed', {
        approval,
        result,
      }),
    );
  } catch (error: unknown) {
    return res
      .status(500)
      .json(errorResponse('An unexpected error occurred', error));
  }
}

export async function rejectApprovalController(
  req: AuthRequest,
  res: Response,
) {
  try {
    if (!req.user?.id || !req.params.companyId || !req.params.approvalId) {
      return res.status(400).json(
        errorResponse('Bad Request', undefined, {
          code: ErrorCode.INVALID_INPUT,
        }),
      );
    }

    const existing = getApproval(String(req.params.approvalId));
    if (!existing) {
      return res.status(404).json(
        errorResponse('Not Found', undefined, {
          code: ErrorCode.INVALID_INPUT,
        }),
      );
    }
    if (existing.companyId !== String(req.params.companyId)) {
      return res.status(403).json(
        errorResponse('Forbidden', undefined, {
          code: ErrorCode.OPERATION_NOT_ALLOWED,
        }),
      );
    }

    const approval = rejectApproval(String(req.params.approvalId));

    return res
      .status(200)
      .json(successResponse('Approval rejected', { approval }));
  } catch (error: unknown) {
    return res
      .status(500)
      .json(errorResponse('An unexpected error occurred', error));
  }
}
