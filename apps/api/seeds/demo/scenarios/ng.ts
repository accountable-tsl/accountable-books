import { getCountry } from 'src/domains/countries/countries.utils.js';
import { getCurrency } from 'src/domains/currencies/currencies.utils.js';
import type { Scenario } from '../engine/registry.js';
import {
  createCompleteCompanyOnboardingState,
  createCompleteUserOnboardingState,
} from 'src/features/onboarding/onboarding.utils.js';

export async function buildNGScenarios(): Promise<Scenario[]> {
  const NGN = await getCurrency('NGN');
  const NG = await getCountry('NG');

  const common = {
    reportingCurrencyId: NGN.id,
    countryId: NG.id,
    yearEndDay: 31,
    yearEndMonth: 12,
    isDemoCompany: true,
  } as const;

  return [
    {
      name: 'demo:NG:accounting_firm:firmDemoNG',
      country: 'NG',
      type: 'accounting_firm',
      company: {
        legalName: 'NG Demo Firm',
        shortCode: 'firmDemoNG',
        slug: 'ng-demo',
        type: 'accounting_firm',
        onboardingState: createCompleteCompanyOnboardingState('accounting_firm'),
        ...common,
      },
      user: {
        firstname: 'Demi',
        lastname: 'Firm',
        email: 'demo.firm.ng@example.com',
        password: 'StrongDemoPass!',
        isDemoUser: true,
        emailVerifiedAt: new Date(),
        onboardingState: createCompleteUserOnboardingState(),
      },
    },
    {
      name: 'demo:NG:business:bizDemoNG',
      country: 'NG',
      type: 'business',
      company: {
        legalName: 'NG Demo Biz Ltd',
        shortCode: 'bizDemoNG',
        type: 'business',
        onboardingState: createCompleteCompanyOnboardingState('business'),
        ...common,
      },
      user: {
        firstname: 'Diane',
        lastname: 'Biz',
        email: 'demo.business.ng@example.com',
        password: 'StrongDemoPass!',
        isDemoUser: true,
        emailVerifiedAt: new Date(),
        onboardingState: createCompleteUserOnboardingState(),
      },
    },
    {
      name: 'demo:NG:individual:indDemoNG',
      country: 'NG',
      type: 'individual',
      company: {
        legalName: "Ronke's Finances",
        shortCode: 'indDemoNG',
        type: 'individual',
        onboardingState: createCompleteCompanyOnboardingState('individual'),
        ...common,
      },
      user: {
        firstname: 'Ronke',
        lastname: 'Doe',
        email: 'demo.individual.ng@example.com',
        password: 'StrongDemoPass!',
        isDemoUser: true,
        emailVerifiedAt: new Date(),
        onboardingState: createCompleteUserOnboardingState(),
      },
    },
  ];
}
