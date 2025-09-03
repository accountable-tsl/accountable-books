import { authRoutes } from '@/shared/routes/definitions/auth';
import { onboardingRoutes } from '@/shared/routes/definitions/onboarding';
import { generalRoutes } from '@/shared/routes/definitions/general';
import { accounting } from '@/shared/routes/definitions/accounting';
import { banking } from '@/shared/routes/definitions/banking';

export const routes = {
  auth: authRoutes,
  onboarding: onboardingRoutes,
  general: generalRoutes,
  accounting,
  banking,
};
