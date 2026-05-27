import { type Response } from 'express';

import {
  AppError,
  ErrorCode,
  errorResponse,
  getHttpStatusFromErrorCode,
} from '../../shared/utils/response.utils.js';
import { getAuditContext } from '../audit/audit.middleware.js';
import { getCompanyIdentifiers } from '../companies/companies.utils.js';
import { getAccessibleCompaniesForUser } from '../user-roles/user-roles.model.js';
import {
  closeBreakGlassSession,
  createSupportGrant,
  listSupportGrantsForCompany,
  openBreakGlassSession,
  revokeSupportGrant,
} from './support-access.model.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';
import type {
  AccessibleCompanies,
  AccessibleCompaniesResponse,
} from '../user-roles/user-roles.types.js';

function isCompanySupportGrantManager(
  companyAccess: AccessibleCompanies | undefined,
): boolean {
  return (
    companyAccess?.accessOrigin === 'explicit_company' &&
    companyAccess.roleScope === 'company' &&
    (companyAccess.roleKey === 'client_owner' ||
      companyAccess.roleKey === 'client_admin')
  );
}

function isGrantedSupportViewer(
  companyAccess: AccessibleCompanies | undefined,
): boolean {
  return companyAccess?.accessOrigin === 'support_grant';
}

function isSuperAdmin(accessProfile: AccessibleCompaniesResponse): boolean {
  return accessProfile.platformUserKey === 'super_admin';
}

async function resolveSupportCompanyRequest(req: AuthRequest): Promise<
  | {
      companyUuid: string;
      companyShortCode: string;
      accessProfile: AccessibleCompaniesResponse;
      companyAccess: AccessibleCompanies | undefined;
    }
  | {
      error: {
        status: number;
        body: ReturnType<typeof errorResponse>;
      };
    }
> {
  if (!req.user?.id) {
    return {
      error: {
        status: 401,
        body: errorResponse('Unauthorized', undefined, {
          code: ErrorCode.UNAUTHORIZED,
        }),
      },
    };
  }

  const companyIdentifier = String(req.params.companyId || '').trim();
  if (!companyIdentifier) {
    return {
      error: {
        status: 400,
        body: errorResponse('Company ID is required', undefined, {
          code: ErrorCode.INVALID_INPUT,
        }),
      },
    };
  }

  try {
    const identifiers = await getCompanyIdentifiers(companyIdentifier);
    const accessProfileResponse = await getAccessibleCompaniesForUser({
      userId: req.user.id,
    });

    if (!accessProfileResponse.success || !accessProfileResponse.data) {
      return {
        error: {
          status: getHttpStatusFromErrorCode(accessProfileResponse.code),
          body: accessProfileResponse,
        },
      };
    }

    if (accessProfileResponse.data.isPlatformUser) {
      Object.assign(req.user, {
        isPlatformUser: true,
        ...(accessProfileResponse.data.platformUserKey != null
          ? { platformUserKey: accessProfileResponse.data.platformUserKey }
          : {}),
      });
    }

    const companyAccess = accessProfileResponse.data.accessibleCompanies.find(
      (company) => company.id === identifiers.short_code,
    );

    return {
      companyUuid: identifiers.id,
      companyShortCode: identifiers.short_code,
      accessProfile: accessProfileResponse.data,
      companyAccess,
    };
  } catch (error) {
    if (error instanceof AppError) {
      return {
        error: {
          status: getHttpStatusFromErrorCode(error.code),
          body: errorResponse(error.message, error, { code: error.code }),
        },
      };
    }

    const body =
      error instanceof Error
        ? errorResponse(error.message)
        : errorResponse('Error validating company');
    return {
      error: {
        status: 500,
        body,
      },
    };
  }
}

export async function listSupportGrantsController(
  req: AuthRequest,
  res: Response,
) {
  const resolved = await resolveSupportCompanyRequest(req);
  if ('error' in resolved) {
    return res.status(resolved.error.status).json(resolved.error.body);
  }

  const { companyUuid, accessProfile, companyAccess } = resolved;
  const requesterUserId = req.user!.id;

  if (
    isSuperAdmin(accessProfile) ||
    isCompanySupportGrantManager(companyAccess)
  ) {
    const result = await listSupportGrantsForCompany({
      companyId: companyUuid,
    });
    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  }

  if (isGrantedSupportViewer(companyAccess)) {
    const result = await listSupportGrantsForCompany({
      companyId: companyUuid,
      supportUserId: requesterUserId,
      activeOnly: true,
    });
    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  }

  return res
    .status(403)
    .json(errorResponse('Forbidden', undefined, { code: ErrorCode.FORBIDDEN }));
}

export async function createSupportGrantController(
  req: AuthRequest,
  res: Response,
) {
  const resolved = await resolveSupportCompanyRequest(req);
  if ('error' in resolved) {
    return res.status(resolved.error.status).json(resolved.error.body);
  }

  if (!isCompanySupportGrantManager(resolved.companyAccess)) {
    return res.status(403).json(
      errorResponse(
        'Only company admins can manage support grants',
        undefined,
        {
          code: ErrorCode.FORBIDDEN,
        },
      ),
    );
  }

  const result = await createSupportGrant({
    companyId: resolved.companyUuid,
    input: req.body,
    grantedByUserId: req.user!.id,
    auditContext: getAuditContext(req),
  });

  return res
    .status(result.success ? 201 : getHttpStatusFromErrorCode(result.code))
    .json(result);
}

export async function revokeSupportGrantController(
  req: AuthRequest,
  res: Response,
) {
  const resolved = await resolveSupportCompanyRequest(req);
  if ('error' in resolved) {
    return res.status(resolved.error.status).json(resolved.error.body);
  }

  if (!isCompanySupportGrantManager(resolved.companyAccess)) {
    return res.status(403).json(
      errorResponse(
        'Only company admins can manage support grants',
        undefined,
        {
          code: ErrorCode.FORBIDDEN,
        },
      ),
    );
  }

  const result = await revokeSupportGrant({
    companyId: resolved.companyUuid,
    grantId: String(req.params.grantId || ''),
    input: req.body,
    revokedByUserId: req.user!.id,
    auditContext: getAuditContext(req),
  });

  return res
    .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
    .json(result);
}

export async function openBreakGlassSessionController(
  req: AuthRequest,
  res: Response,
) {
  const resolved = await resolveSupportCompanyRequest(req);
  if ('error' in resolved) {
    return res.status(resolved.error.status).json(resolved.error.body);
  }

  if (!isSuperAdmin(resolved.accessProfile)) {
    return res.status(403).json(
      errorResponse(
        'Only super admins may open break-glass access',
        undefined,
        {
          code: ErrorCode.FORBIDDEN,
        },
      ),
    );
  }

  const result = await openBreakGlassSession({
    companyId: resolved.companyUuid,
    input: req.body,
    superAdminUserId: req.user!.id,
    auditContext: getAuditContext(req),
  });

  return res
    .status(result.success ? 201 : getHttpStatusFromErrorCode(result.code))
    .json(result);
}

export async function closeBreakGlassSessionController(
  req: AuthRequest,
  res: Response,
) {
  const resolved = await resolveSupportCompanyRequest(req);
  if ('error' in resolved) {
    return res.status(resolved.error.status).json(resolved.error.body);
  }

  if (!isSuperAdmin(resolved.accessProfile)) {
    return res.status(403).json(
      errorResponse(
        'Only super admins may close break-glass access',
        undefined,
        {
          code: ErrorCode.FORBIDDEN,
        },
      ),
    );
  }

  const reason =
    typeof req.body?.reason === 'string' ? req.body.reason : undefined;

  const result = await closeBreakGlassSession({
    companyId: resolved.companyUuid,
    sessionId: String(req.params.sessionId || ''),
    closeReason: reason,
    closedByUserId: req.user!.id,
    auditContext: getAuditContext(req),
  });

  return res
    .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
    .json(result);
}
