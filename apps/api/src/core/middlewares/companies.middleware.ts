import { type Response, type NextFunction } from 'express';
import { errorResponse } from '../../shared/utils/response.utils.js';
import type { AuthRequest } from '../../features/auth/auth.types.js';
import { getSingleCompany } from '../../domains/companies/companies.model.js';
import { getAccessibleCompaniesForUser } from '../../domains/userRoles/userRoles.model.js';

export const checkCompanyId = async (req: AuthRequest, res: Response, next: NextFunction) => {
  let companyId: string;
  companyId = req.params.companyId || req.body.companyId || req.query.companyId;

  if (!companyId || typeof companyId !== 'string' || companyId.length > 40) {
    return res.status(400).json({ message: 'Invalid Company Identifier' });
  }

  try {
    const company = await getSingleCompany(companyId);
    if (!company || !company.data?.id) {
      return res.status(404).json(errorResponse('Company not found'));
    }

    // Get user's access to this company
    if (!req.user?.id) {
      return res.status(401).json(errorResponse('User not authenticated'));
    }
    const userAccess = await getAccessibleCompaniesForUser({ userId: req.user.id });
    const accessibleCompany = userAccess.data?.accessibleCompanies.find((c) => c.id === companyId);

    if (!accessibleCompany) {
      return res.status(403).json(errorResponse('Access denied to this company'));
    }

    req.company = accessibleCompany;

    next();
  } catch (error: any) {
    res.status(500).json(errorResponse('Error validating company', error.message));
  }
};
