import { getCountry } from 'src/domains/countries/countries.utils.js';
import { getCurrency } from 'src/domains/currencies/currencies.utils.js';
import type { Scenario } from '../engine/registry.js';
import {
  createCompleteCompanyOnboardingState,
  createCompleteUserOnboardingState,
} from '../../../src/features/onboarding/onboarding.utils.js';

export async function buildUSScenarios(): Promise<Scenario[]> {
  const USD = await getCurrency('USD');
  const US = await getCountry('US');

  const common = {
    reportingCurrencyId: USD.id,
    countryId: US.id,
    yearEndDay: 31,
    yearEndMonth: 12,
    isDemoCompany: true,
  } as const;

  return [
    {
      name: 'demo:US:accounting_firm:firmDemoUS',
      country: 'US',
      type: 'accounting_firm',
      company: {
        legalName: 'US Demo Firm',
        shortCode: 'firmDemoUS',
        slug: 'us-demo',
        type: 'accounting_firm',
        onboardingState: createCompleteCompanyOnboardingState('accounting_firm'),
        ...common,
      },
      user: {
        firstname: 'Uma',
        lastname: 'Firm',
        email: 'demo.firm.us@example.com',
        password: 'StrongDemoPass!',
        isDemoUser: true,
        emailVerifiedAt: new Date(),
        onboardingState: createCompleteUserOnboardingState(),
      },
    },
    {
      name: 'demo:US:business:bizDemoUS',
      country: 'US',
      type: 'business',
      company: {
        legalName: 'US Demo Biz LLC',
        shortCode: 'bizDemoUS',
        type: 'business',
        onboardingState: createCompleteCompanyOnboardingState('business'),
        ...common,
      },
      user: {
        firstname: 'Uma',
        lastname: 'Biz',
        email: 'demo.business.us@example.com',
        password: 'StrongDemoPass!',
        isDemoUser: true,
        emailVerifiedAt: new Date(),
        onboardingState: createCompleteUserOnboardingState(),
      },
    },
    {
      name: 'demo:US:individual:indDemoUS',
      country: 'US',
      type: 'individual',
      company: {
        legalName: "Uma's Finances",
        shortCode: 'indDemoUS',
        type: 'individual',
        onboardingState: createCompleteCompanyOnboardingState('individual'),
        ...common,
      },
      user: {
        firstname: 'Uma',
        lastname: 'Doe',
        email: 'demo.individual.us@example.com',
        password: 'StrongDemoPass!',
        isDemoUser: true,
        emailVerifiedAt: new Date(),
        onboardingState: createCompleteUserOnboardingState(),
      },
    },
  ];
}
