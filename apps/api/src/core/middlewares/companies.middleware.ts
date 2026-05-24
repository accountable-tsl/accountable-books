import { type NextFunction, type Response } from 'express';

import { getCompanyIdentifiers } from '../../domains/companies/companies.utils.js';
import { getAccessibleCompaniesForUser } from '../../domains/user-roles/user-roles.model.js';
import { updateRequestContext } from '../../shared/telemetry/request-context.js';
import {
  AppError,
  ErrorCode,
  errorResponse,
  getHttpStatusFromErrorCode,
} from '../../shared/utils/response.utils.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';

function resolveCompanyIdentifier(req: AuthRequest): string | null {
  const fromParams = req.params?.companyId;
  if (typeof fromParams === 'string' && fromParams.trim()) {
    return fromParams.trim();
  }

  const fromBody = (req.body as { companyId?: unknown } | undefined)?.companyId;
  if (typeof fromBody === 'string' && fromBody.trim()) {
    return fromBody.trim();
  }

  const fromQuery = req.query?.companyId;
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return fromQuery.trim();
  }

  return null;
}

export const checkCompanyId = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const companyIdentifier = resolveCompanyIdentifier(req);

  if (!companyIdentifier || companyIdentifier.length > 50) {
    return res.status(400).json(
      errorResponse('Invalid Company Identifier', undefined, {
        code: ErrorCode.INVALID_INPUT,
      }),
    );
  }

  try {
    let companyUuid: string;
    let companyShortCode: string;
    try {
      const identifiers = await getCompanyIdentifiers(companyIdentifier);
      companyUuid = identifiers.id;
      companyShortCode = identifiers.short_code;
    } catch (error) {
      if (error instanceof AppError) {
        return res
          .status(getHttpStatusFromErrorCode(error.code))
          .json(errorResponse(error.message, error, { code: error.code }));
      }

      return res
        .status(500)
        .json(
          errorResponse(
            'Error validating company',
            error instanceof Error ? error.message : 'Unknown error',
          ),
        );
    }

    if (!req.user?.id) {
      return res.status(401).json(errorResponse('User not authenticated'));
    }
    const userAccess = await getAccessibleCompaniesForUser({
      userId: req.user.id,
    });
    if (!userAccess.success || !userAccess.data) {
      return res.status(getHttpStatusFromErrorCode(userAccess.code)).json(
        userAccess.message
          ? userAccess
          : errorResponse('Error validating company', undefined, {
              code: ErrorCode.GENERIC,
            }),
      );
    }

    const accessProfile = userAccess.data;

    // JWT middleware only sets req.user.id; merge platform flags for PATCH/demo policy.
    if (accessProfile.isPlatformUser) {
      Object.assign(req.user, {
        isPlatformUser: true,
        ...(accessProfile.platformUserKey != null
          ? { platformUserKey: accessProfile.platformUserKey }
          : {}),
      });
    }

    const accessibleCompany = accessProfile.accessibleCompanies.find(
      (c) => c.id === companyShortCode,
    );

    if (!accessibleCompany) {
      return res
        .status(403)
        .json(errorResponse('Access denied to this company'));
    }

    req.company = accessibleCompany;
    req.companyContext = {
      identifier: companyIdentifier,
      uuid: companyUuid,
      shortCode: companyShortCode,
    };
    updateRequestContext({ companyId: companyUuid });

    next();
  } catch (error: unknown) {
    res
      .status(500)
      .json(
        errorResponse(
          'Error validating company',
          error instanceof Error ? error.message : 'Unknown error',
        ),
      );
  }
};
