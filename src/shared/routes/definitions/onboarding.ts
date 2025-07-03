import { route } from "@/shared/routes/utils";

export const onboardingRoutes = {
  index: route("/onboarding", { public: true, label: "Onboarding" }),
  verifyEmail: route("/verify-email", { public: true, label: "Verify Email" }),
  step: route("/onboarding/:step"),
  welcome: route("/onboarding/welcome"),
};
