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

    const companyId = String(req.params.companyId);
    const approvalId = String(req.params.approvalId);

    const existing = await getApproval({ approvalId, companyId });
    if (!existing) {
      return res.status(404).json(
        errorResponse('Not Found', undefined, {
          code: ErrorCode.INVALID_INPUT,
        }),
      );
    }

    const { approval, result } = await executeApproval({
      approvalId,
      companyId,
    });

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

    const companyId = String(req.params.companyId);
    const approvalId = String(req.params.approvalId);

    const existing = await getApproval({ approvalId, companyId });
    if (!existing) {
      return res.status(404).json(
        errorResponse('Not Found', undefined, {
          code: ErrorCode.INVALID_INPUT,
        }),
      );
    }

    const approval = await rejectApproval({ approvalId, companyId });

    return res
      .status(200)
      .json(successResponse('Approval rejected', { approval }));
  } catch (error: unknown) {
    return res
      .status(500)
      .json(errorResponse('An unexpected error occurred', error));
  }
}
