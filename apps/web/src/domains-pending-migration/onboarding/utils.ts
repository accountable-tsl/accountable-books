import { routes } from '@/shared/routes/routes';
import {
  Building2Icon,
  CreditCardIcon,
  MailCheckIcon,
  Settings,
} from 'lucide-react';

import { BankAccount } from './steps/BankAccount';
import { CompanyInfo } from './steps/CompanyInfo';
import { Miscellaneous } from './steps/Miscellaneous';
import { VerifyEmail } from './steps/VerifyEmail';

import type { OnboardingSidebarItem, OnboardingStepKey } from './types';

export type OnboardingPathKey =
  | 'verify-email'
  | 'company-details'
  | 'add-bank-account'
  | 'miscellaneous';

export const onboardingStepToSlug = {
  email_verified: routes.onboarding.verifyEmail.staticPath,
  company_details_confirmed: routes.onboarding.step.build({
    step: 'company-details',
  }),
  first_bank_account_added: routes.onboarding.step.build({
    step: 'add-bank-account',
  }),
  miscellaneous_completed: routes.onboarding.step.build({
    step: 'miscellaneous',
  }),
} as const;
export type OnboardingSlug = (typeof onboardingStepToSlug)[OnboardingStepKey];

export const onboardingStepsConfig: Record<
  OnboardingStepKey,
  OnboardingSidebarItem
> = {
  email_verified: {
    icon: MailCheckIcon,
    title: 'Verify Email',
    description: 'Confirm your email address',
  },
  company_details_confirmed: {
    icon: Building2Icon,
    title: 'Company Vitals',
    description: 'Update/verify company details',
  },
  first_bank_account_added: {
    icon: CreditCardIcon,
    title: 'Add Bank Account',
    description: 'Link your bank account',
  },
  miscellaneous_completed: {
    icon: Settings,
    title: 'Final Setup',
    description: 'Complete optional configurations',
  },
};

export function getPathByStepKey(
  stepKey: OnboardingStepKey,
): OnboardingPathKey | undefined {
  return Object.entries(onboardingSteps).find(
    ([, value]) => value.key === stepKey,
  )?.[0] as OnboardingPathKey | undefined;
}

export const onboardingSteps: Record<
  OnboardingPathKey,
  { key: OnboardingStepKey; Component: React.FC }
> = {
  'verify-email': {
    key: 'email_verified',
    Component: VerifyEmail,
  },
  'company-details': {
    key: 'company_details_confirmed',
    Component: CompanyInfo,
  },
  'add-bank-account': {
    key: 'first_bank_account_added',
    Component: BankAccount,
  },
  miscellaneous: {
    key: 'miscellaneous_completed',
    Component: Miscellaneous,
  },
};
