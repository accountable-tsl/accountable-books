import { Response } from "express";
import { AuthRequest } from "../auth/auth.types";
import { ErrorCode, errorResponse } from "../../shared/utils/response.utils";
// import { updateOnboardingStatus } from "./onboarding.service";

export async function updateOnboardingStatusController(
  req: AuthRequest,
  res: Response
) {
  const isLoggedIn = req.user?.id || req.company?.id ? true : false;
  const userId = req.user?.id || req.body.userId;
  const companyId =
    req.company?.id || req.user?.currentCompanyId || req.body.companyId;

  if (!userId || !companyId) {
    return res.status(403).json(
      errorResponse("Unauthorized", undefined, {
        code: ErrorCode.UNAUTHORIZED,
      })
    );
  }

  try {
    const result = await updateOnboardingStatus(userId, companyId, isLoggedIn);
    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal server error"));
  }
}
