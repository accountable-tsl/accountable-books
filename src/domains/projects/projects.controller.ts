import { Response } from "express";
import { AuthRequest } from "../../features/auth/auth.types";
import { errorResponse } from "../../shared/utils/response.utils";
import { addNewProjects, getProjects } from "./projects.model ";
import { getProjectsParams } from "./projects.types";
import { toArray } from "../../shared/utils/formatting.utils";

export async function getProjectsController(req: AuthRequest, res: Response) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const filters = req.body;

    if (!userId || !companyId)
      return res.status(400).json(errorResponse("Bad Request"));

    const result = await getProjects({ companyId, ...filters });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse("An unexpected error occurred"));
  }
}

export async function addNewProjectsController(
  req: AuthRequest,
  res: Response
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const data = Array.isArray(req.body) ? req.body : [req.body];

    if (!userId || !companyId)
      return res.status(400).json(errorResponse("Bad Request"));

    const result = await addNewProjects({ companyId, input: data, userId });
    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse("An unexpected error occurred"));
  }
}
