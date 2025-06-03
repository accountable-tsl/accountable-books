import express from "express";
import { updateOnboardingStatusController } from "./onboarding.controller";
import { verifyRefreshToken } from "../auth/auth.middleware";

const router = express.Router({ mergeParams: true });

router.post("/advance", verifyRefreshToken, updateOnboardingStatusController);

export default router;
