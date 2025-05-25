import express from "express";
import { updateOnboardingStatusController } from "./onboarding.controller";

const router = express.Router({ mergeParams: true });

router.post("/status", updateOnboardingStatusController);

export default router;
