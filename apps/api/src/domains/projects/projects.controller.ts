import { type Response } from 'express';

import { type AuthRequest } from '../../features/auth/auth.types.js';
import {
  errorResponse,
  getHttpStatusFromErrorCode,
} from '../../shared/utils/response.utils.js';
import {
  addNewProjects,
  deleteProject,
  getProjects,
  updateProjects,
} from './projects.model.js';

export async function getProjectsController(req: AuthRequest, res: Response) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const filters = req.body;

    if (!userId || !companyId)
      return res.status(400).json(errorResponse('Bad Request'));

    const result = await getProjects({ companyId, ...filters });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function addNewProjectsController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const data = Array.isArray(req.body) ? req.body : [req.body];

    if (!userId || !companyId)
      return res.status(400).json(errorResponse('Bad Request'));

    const result = await addNewProjects({ companyId, input: data, userId });
    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function updateProjectsController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const data = Array.isArray(req.body) ? req.body : [req.body];

    if (!userId || !companyId)
      return res.status(400).json(errorResponse('Bad Request'));

    const result = await updateProjects({
      companyId,
      updates: data,
      userId,
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function deleteProjectController(req: AuthRequest, res: Response) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const id = String(req.params.projectId);

    if (!userId || !companyId || !id)
      return res.status(400).json(errorResponse('Bad Request'));

    const result = await deleteProject({
      companyId,
      input: { id },
      userId,
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}
