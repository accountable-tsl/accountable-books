import { type Request, type Response } from 'express';

import { type AuthRequest } from '../../features/auth/auth.types.js';
import {
  generateCsrfToken,
  setAuthCookies,
} from '../../features/auth/auth.utils.js';
import {
  AppError,
  ErrorCode,
  errorResponse,
  getHttpStatusFromErrorCode,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { getAuditContext } from '../audit/audit.middleware.js';
import {
  getCompanies,
  getSingleCompany,
  switchCompany,
  updateCompany,
} from './companies.model.js';
import { getWorkspaceCompanyPatchDeniedReason } from './companies.workspace-mutation.policy.js';

export const switchCompanyController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const companyId = req.body.companyId;
    if (!req.user || !companyId) throw new AppError('Unauthorized');

    const switchResult = await switchCompany({
      user: req.user,
      newCompanyId: companyId,
    });

    if (!switchResult.success || !switchResult.data) {
      return res
        .status(getHttpStatusFromErrorCode(switchResult.code))
        .json(switchResult);
    }

    const { accessToken, refreshToken, user, company } = switchResult.data;
    setAuthCookies(req, res, accessToken, refreshToken);

    req.company = company;
    req.user = user;
    const csrfToken = generateCsrfToken(req, res);

    return res.json(
      successResponse('Company switched successfully', {
        user,
        csrfToken,
      }),
    );
  } catch (error: unknown) {
    res.status(500).json(errorResponse('Something went wrong'));
  }
};

export const getCompaniesController = async (req: Request, res: Response) => {
  try {
    const result = await getCompanies();

    if (!result.success) {
      return res.status(getHttpStatusFromErrorCode(result.code)).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    return res
      .status(500)
      .json(errorResponse(error.message || 'An unexpected error occurred'));
  }
};
export const getCompanyController = async (req: AuthRequest, res: Response) => {
  try {
    const companyId = String(req.params.companyId);
    if (!companyId) {
      return res.status(400).json(errorResponse('Company ID is required'));
    }
    const company = await getSingleCompany(companyId);

    if (!company || !company.success) {
      return res.status(getHttpStatusFromErrorCode(company.code)).json(company);
    }

    return res.status(200).json(company);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('Internal server error'));
  }
};

export const updateCompanyController = async (
  req: AuthRequest,
  res: Response,
) => {
  const companyId = String(req.params.companyId);
  const userId = req.user?.id;
  const data = req.body;
  const {
    companyId: companyIdFromData,
    userId: userIdFromData,
    ...updateData
  } = data;

  if (!companyId || !userId) {
    return res.status(400).json(errorResponse('Bad Request'));
  }

  if (!req.company) {
    return res.status(500).json(
      errorResponse('Company context missing', undefined, {
        code: ErrorCode.GENERIC,
      }),
    );
  }

  const patchDenied = getWorkspaceCompanyPatchDeniedReason(
    req.user,
    req.company,
  );
  if (patchDenied) {
    return res
      .status(403)
      .json(
        errorResponse(patchDenied, undefined, { code: ErrorCode.FORBIDDEN }),
      );
  }

  try {
    const result = await updateCompany(
      companyId,
      updateData,
      userId,
      undefined,
      {
        audit: {
          actor: {
            type: 'user',
            userId,
          },
          context: getAuditContext(req),
        },
      },
    );
    if (!result.success) {
      return res.status(getHttpStatusFromErrorCode(result.code)).json(result);
    }

    return res.status(200).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('Something went wrong'));
  }
};
