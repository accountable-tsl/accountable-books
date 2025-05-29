import { Response } from "express";
import { AuthRequest } from "../auth/auth.types";
import { updateOnboardingStatus } from "./onboarding.service";
import {
  onboardingStatus,
  OnboardingStatus,
} from "../../domains/users/users.types";
import { errorResponse } from "../../shared/utils/response.utils";

export async function updateOnboardingStatusController(
  req: AuthRequest,
  res: Response
) {
  const userId = req.user?.id || req.body.userId;
  const onboardingStatus: OnboardingStatus = req.body.onboardingStatus;

  if (!userId) {
    return res.status(403).json(errorResponse("Unauthorized"));
  }

  const parsedStatus = onboardingStatus.safeParse(onboardingStatus);
  if (!onboardingStatus || !parsedStatus.success) {
    return res.status(400).json(errorResponse("Invalid onboarding status"));
  }

  try {
    const result = await updateOnboardingStatus(userId, onboardingStatus);

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal server error"));
  }
}
