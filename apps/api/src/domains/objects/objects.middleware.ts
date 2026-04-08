import { type NextFunction, type Response } from 'express';

import { knexClient } from '../../db/knexClient.js';
import { type AuthRequest } from '../../features/auth/auth.types.js';
import { ErrorCode, errorResponse } from '../../shared/utils/response.utils.js';
import { getWorkspaceCompanyPatchDeniedReason } from '../companies/companies.workspace-mutation.policy.js';

function ensureAuthenticatedUser(req: AuthRequest, res: Response): boolean {
  if (req.user?.id) {
    return true;
  }

  res.status(401).json(
    errorResponse('Unauthorized', undefined, {
      code: ErrorCode.UNAUTHORIZED,
    }),
  );
  return false;
}

function ensureCompanyContext(req: AuthRequest, res: Response): boolean {
  if (req.company) {
    return true;
  }

  res.status(500).json(
    errorResponse('Company context missing', undefined, {
      code: ErrorCode.GENERIC,
    }),
  );
  return false;
}

function enforceWorkspaceCompanyPatchPolicy(
  req: AuthRequest,
  res: Response,
): boolean {
  const deniedReason = getWorkspaceCompanyPatchDeniedReason(
    req.user,
    req.company,
  );
  if (!deniedReason) {
    return true;
  }

  res.status(403).json(
    errorResponse(deniedReason, undefined, {
      code: ErrorCode.FORBIDDEN,
    }),
  );
  return false;
}

export function requireUploadIntentAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!ensureAuthenticatedUser(req, res) || !ensureCompanyContext(req, res)) {
    return;
  }

  if (req.body?.purpose === 'company_logo') {
    if (!enforceWorkspaceCompanyPatchPolicy(req, res)) {
      return;
    }
  }

  return next();
}

export async function requireFinalizeUploadIntentAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!ensureAuthenticatedUser(req, res) || !ensureCompanyContext(req, res)) {
    return;
  }

  const intentId =
    typeof req.body?.intentId === 'string' ? req.body.intentId : null;
  const companyUuid = req.companyContext?.uuid;

  if (!intentId || !companyUuid) {
    res.status(400).json(
      errorResponse('Upload intent id is required', undefined, {
        code: ErrorCode.INVALID_INPUT,
      }),
    );
    return;
  }

  const uploadIntent = await knexClient('upload_intents')
    .select('purpose')
    .where({
      id: intentId,
      company_id: companyUuid,
      requested_by_id: req.user!.id,
    })
    .first<{ purpose: 'company_logo' | 'txn_attachment' }>();

  if (!uploadIntent) {
    res.status(404).json(
      errorResponse('Upload intent not found', undefined, {
        code: ErrorCode.NOT_FOUND,
      }),
    );
    return;
  }

  if (
    uploadIntent.purpose === 'company_logo' &&
    !enforceWorkspaceCompanyPatchPolicy(req, res)
  ) {
    return;
  }

  return next();
}

export function requireCompanyLogoMutationAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!ensureAuthenticatedUser(req, res) || !ensureCompanyContext(req, res)) {
    return;
  }

  if (!enforceWorkspaceCompanyPatchPolicy(req, res)) {
    return;
  }

  return next();
}
