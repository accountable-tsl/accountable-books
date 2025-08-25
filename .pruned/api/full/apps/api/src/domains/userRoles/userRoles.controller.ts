import { type Response } from 'express';
import { type AuthRequest } from '../../features/auth/auth.types.js';
import { grantDirectAccess } from './userRoles.model.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import { roleKey as roleKeyEnum } from '../roles/roles.types.js';

export async function grantAccessToCompanyController(req: AuthRequest, res: Response) {
  const { userId, companyId, roleKey } = req.body;
  const grantedBy = req.user?.id;

  if (
    !grantedBy ||
    !userId ||
    !roleKey ||
    !roleKeyEnum.options.includes(roleKey) ||
    !companyId ||
    !grantedBy
  ) {
    return res.status(400).json(errorResponse('Missing required fields'));
  }

  try {
    const result = await grantDirectAccess({
      userId,
      roleKey,
      companyId,
      grantedBy,
    });

    return result.success ? res.status(200).json(result) : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('Internal server error'));
  }
}
