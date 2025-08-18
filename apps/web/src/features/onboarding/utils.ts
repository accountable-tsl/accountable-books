import { Building2Icon, CreditCardIcon, MailCheckIcon } from 'lucide-react';
import { OnboardingSidebarItem, OnboardingStepKey } from './types';
import { routes } from '@/shared/routes/routes';
import { VerifyEmail } from './steps/VerifyEmail';
import { CompanyInfo } from './steps/CompanyInfo';
import { BankAccount } from './steps/BankAccount';

export type OnboardingPathKey = 'verify-email' | 'company-details' | 'add-bank-account';

export const onboardingStepToSlug = {
  email_verified: routes.onboarding.verifyEmail.staticPath,
  company_details_confirmed: routes.onboarding.step.build({
    step: 'company-details',
  }),
  first_bank_account_added: routes.onboarding.step.build({
    step: 'add-bank-account',
  }),
} as const;
export type OnboardingSlug = (typeof onboardingStepToSlug)[OnboardingStepKey];

export const onboardingStepsConfig: Record<OnboardingStepKey, OnboardingSidebarItem> = {
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
};

export function getPathByStepKey(stepKey: OnboardingStepKey): OnboardingPathKey | undefined {
  return Object.entries(onboardingSteps).find(([, value]) => value.key === stepKey)?.[0] as
    | OnboardingPathKey
    | undefined;
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
};
