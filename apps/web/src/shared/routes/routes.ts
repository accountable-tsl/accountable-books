import { accounting } from '@/shared/routes/definitions/accounting';
import { authRoutes } from '@/shared/routes/definitions/auth';
import { banking } from '@/shared/routes/definitions/banking';
import { generalRoutes } from '@/shared/routes/definitions/general';
import { onboardingRoutes } from '@/shared/routes/definitions/onboarding';

export const routes = {
  auth: authRoutes,
  onboarding: onboardingRoutes,
  general: generalRoutes,
  accounting,
  banking,
};
