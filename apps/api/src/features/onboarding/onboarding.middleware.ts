import { type NextFunction, type Response } from 'express';

import { getSingleCompany } from '../../domains/companies/companies.model.js';
import { getUserDetails } from '../../domains/users/users.model.js';
import { redis } from '../../lib/redis.js';
import { ErrorCode, errorResponse } from '../../shared/utils/response.utils.js';
import { type AuthRequest } from '../auth/auth.types.js';

export const checkOnboardingStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user?.id;
  const companyId = req.user?.currentCompanyId;

  if (!userId || !companyId) {
    return res.status(403).json(
      errorResponse('Unauthorized', undefined, {
        code: ErrorCode.UNAUTHORIZED,
      }),
    );
  }

  const company = await getSingleCompany(companyId);
  if (!company || !company.success || !company.data) {
    return res.status(404).json(errorResponse('Company not found'));
  }

  const companyData = Array.isArray(company.data)
    ? company.data[0]
    : company.data;

  // If company is demo company, allow access
  if (companyData.isDemoCompany) {
    return next();
  }

  // Use cache for complete states
  const userCacheKey = `onboarding:user:${userId}`;
  const companyCacheKey = `onboarding:company:${companyId}`;

  const [cachedUserStatus, cachedCompanyStatus] = await Promise.all([
    redis.get(userCacheKey),
    redis.get(companyCacheKey),
  ]);

  const onboardingComplete = '';
  let userComplete = cachedUserStatus === onboardingComplete;
  let companyComplete = cachedCompanyStatus === 'true';

  if (!userComplete) {
    const user = await getUserDetails(userId);
    if (!user || !user.success) {
      return res.status(404).json(
        errorResponse('User not found', undefined, {
          code: ErrorCode.NOT_FOUND,
        }),
      );
    }

    if (companyData.onboardingStatus === onboardingComplete) {
      await redis.set(userCacheKey, onboardingComplete, 'EX', 7200); // 2 hour cache
      userComplete = true;
    }
  }

  // Check if onboarding_status in users table is onboarding_complete
  // Check if the current company they are trying to access has is_onboarding_complete set to true
  // if both are true, allow access (next())
  if (!companyComplete && companyData.onboardingStatus === onboardingComplete) {
    await redis.set(companyCacheKey, 'true', 'EX', 21600); // 6 hour cache
    companyComplete = true;
  }

  // Allow access if both user and company onboarding are complete
  if (userComplete && companyComplete) {
    return next();
  }

  // else, if user is the creator checked by comparing user id to company.created_by_id, redirect them to onboarding or just return success false and let frontend handle it (note that all companies must use url <firmslug>.<domain>...)
  //   Determine creator
  const isCreator = userId === companyData.createdById;
  if (isCreator) {
    return res.status(403).json(
      errorResponse('Onboarding not complete', undefined, {
        code: ErrorCode.ONBOARDING_INCOMPLETE,
      }),
    );
  }

  // if user is not the creator, maybe just return success false and some code and let frontend ask them to contact whoever invited them to the company
  return res.status(403).json(
    errorResponse('Company setup not complete. Contact creator', undefined, {
      code: ErrorCode.ONBOARDING_INCOMPLETE,
    }),
  );
};
