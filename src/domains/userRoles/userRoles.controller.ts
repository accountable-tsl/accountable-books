import { Response } from "express";
import { AuthRequest } from "../../features/auth/auth.types";
import { grantAccessToCompany } from "./userRoles.model";
import { errorResponse } from "../../shared/utils/response.utils";

export async function grantAccessToCompanyController(
  req: AuthRequest,
  res: Response
) {
  const userId = req.user?.id;
  const companyId = req.body.id || req.params.companyId;
  const receivedRoleName = req.body.roleName;

  console.log({ userId, companyId, receivedRoleName });

  // only handle demo_user for now
  const roleName = receivedRoleName || "demo_user";
  if (!userId || !roleName || !companyId)
    return res.status(400).json(errorResponse("Missing required fields"));

  try {
    const result = await grantAccessToCompany({
      userId,
      roleName,
      companyId,
    });

    console.log(result);

    result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal server error"));
  }
}
