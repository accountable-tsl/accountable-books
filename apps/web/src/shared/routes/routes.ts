import { accounting } from './definitions/accounting';
import { authRoutes } from './definitions/auth';
import { banking } from './definitions/banking';
import { generalRoutes } from './definitions/general';
import { onboardingRoutes } from './definitions/onboarding';

export const routes = {
  auth: authRoutes,
  onboarding: onboardingRoutes,
  general: generalRoutes,
  accounting,
  banking,
};
