import { Response } from "express";
import { AuthRequest } from "../../features/auth/auth.types";
import { grantDirectAccess } from "./userRoles.model";
import { errorResponse } from "../../shared/utils/response.utils";
import { roleKey as roleKeyEnum } from "../roles/roles.types";

export async function grantAccessToCompanyController(
  req: AuthRequest,
  res: Response
) {
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
    return res.status(400).json(errorResponse("Missing required fields"));
  }

  try {
    const result = await grantDirectAccess({
      userId,
      roleKey,
      companyId,
      grantedBy,
    });

    console.log(result);

    result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal server error"));
  }
}
