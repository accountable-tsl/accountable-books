import { authRoutes } from "@/shared/routes/definitions/auth";
import { onboardingRoutes } from "@/shared/routes/definitions/onboarding";
import { generalRoutes } from "./definitions/general";

export const routes = {
  auth: authRoutes,
  onboarding: onboardingRoutes,
  general: generalRoutes,
};
