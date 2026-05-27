import { route } from '../route-factory';

export const onboardingRoutes = {
  index: route('/onboarding', {
    label: 'Onboarding',
    public: false,
    requiresCompanyId: false,
  }),

  verifyEmail: route('/verify-email', {
    label: 'Verify Email',
    public: true,
    requiresCompanyId: false,
  }),

  step: route('/onboarding/:step', {
    public: false,
    requiresCompanyId: false,
  }),
};
