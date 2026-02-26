import { type NextFunction, type Response } from 'express';

import { getCompanyIdentifiers } from '../../domains/companies/companies.utils.js';
import { getAccessibleCompaniesForUser } from '../../domains/userRoles/userRoles.model.js';
import { errorResponse } from '../../shared/utils/response.utils.js';

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
    return res.status(400).json({ message: 'Invalid Company Identifier' });
  }

  try {
    let companyUuid: string;
    let companyShortCode: string;
    try {
      const identifiers = await getCompanyIdentifiers(companyIdentifier);
      companyUuid = identifiers.id;
      companyShortCode = identifiers.short_code;
    } catch (error) {
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('not found')) {
          return res.status(404).json(errorResponse('Company not found'));
        }
        if (message.includes('invalid')) {
          return res
            .status(400)
            .json(errorResponse('Invalid Company Identifier'));
        }
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

    // Get user's access to this company
    if (!req.user?.id) {
      return res.status(401).json(errorResponse('User not authenticated'));
    }
    const userAccess = await getAccessibleCompaniesForUser({
      userId: req.user.id,
    });
    if (!userAccess.success || !userAccess.data) {
      return res
        .status(500)
        .json(errorResponse(userAccess.message || 'Error validating company'));
    }

    const accessibleCompany = userAccess.data?.accessibleCompanies.find(
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
