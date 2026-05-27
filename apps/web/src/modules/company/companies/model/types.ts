import type { CompanyType } from '@accountable-books/contracts/schema';
import {
  accountingBasis,
  companyResponse as companyData,
  companyOnboardingState as companyOnboardingStateSchema,
  companyType,
  firmType,
  reportingFramework,
  updateCompanyPayload as updateCompanySchema,
} from '@accountable-books/contracts/schema';
import { isKnownTimezone } from '@accountable-books/utils/timezone';
import { z } from 'zod';

export {
  accountingBasis,
  companyData,
  companyType,
  firmType,
  updateCompanySchema,
};

export type AccountingBasis = z.infer<typeof accountingBasis>;
export type { CompanyType };

export const userOnboardingStepKeys = {
  emailVerified: 'email_verified',
} as const;

export const companyOnboardingStepKeys = {
  companyDetailsConfirmed: 'company_details_confirmed',
  firstBankAccountAdded: 'first_bank_account_added',
} as const;

export const onboardingStepKeys = {
  ...userOnboardingStepKeys,
  ...companyOnboardingStepKeys,
  miscellaneousCompleted: 'miscellaneous_completed',
} as const;

export type UserOnboardingStepKey =
  (typeof userOnboardingStepKeys)[keyof typeof userOnboardingStepKeys];
export type CompanyOnboardingStepKey =
  (typeof companyOnboardingStepKeys)[keyof typeof companyOnboardingStepKeys];
export type OnboardingStepKey =
  (typeof onboardingStepKeys)[keyof typeof onboardingStepKeys];

export const onboardingStatus = z.enum([
  'not_started',
  'email_verified',
  'company_vitals_needed',
  'first_bank_account_needed',
  'onboarding_complete',
]);
export type OnboardingStatus = z.infer<typeof onboardingStatus>;

export const companyOnboardingState = companyOnboardingStateSchema;
export type CompanyOnboardingState = z.infer<typeof companyOnboardingState>;

export type OnboardingStep = {
  key: OnboardingStepKey;
  label: string;
  complete: boolean;
  blocked: boolean;
  optional: boolean;
  scope: 'user' | 'company';
  orderIndex?: number;
};

export type OnboardingState = {
  isCompanyOwner: boolean;
  canAccessApp: boolean;
  userStepsComplete: boolean;
  nextStepToComplete: OnboardingStepKey | null;
  steps: OnboardingStep[];
};

export type FirmType = z.infer<typeof firmType>;

export type CompanyStore = {
  companyId: string | null;
  companyType: CompanyType | undefined;
  slug: string | null;
  company: CompanyData | null;
  isLoading: boolean;
  error: string | null;
  onboardingStatus: OnboardingStatus | null;
  fetchCompany: (companyId: string) => void;
  setCompany: (
    company: CompanyData | ((prev: CompanyData | null) => CompanyData | null),
  ) => void;
  setOnboardingStatus: (status: OnboardingStatus) => void;
  clearCompany: () => void;
};

export const baseCompanyData = companyData.pick({
  id: true,
  legalName: true,
  companyType: true,
  yearEndDay: true,
  yearEndMonth: true,
  countryId: true,
  reportingCurrencyId: true,
  createdById: true,
  reportingCurrencyCode: true,
  reportingCurrencyName: true,
  assignedFirmId: true,
  isPlatform: true,
});
export type BaseCompanyData = z.infer<typeof baseCompanyData>;

export type CompanyData = z.infer<typeof companyData>;
export type UpdateCompanyData = z.infer<typeof updateCompanySchema>;

const trimmedNullishFormString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => {
      if (value == null) return null;
      return value.length === 0 ? null : value;
    });

const trimmedNullishTimezone = z
  .string()
  .trim()
  .refine(isKnownTimezone, 'Use a valid IANA timezone (e.g. America/New_York)')
  .nullish()
  .or(z.literal(''))
  .transform((value) => {
    if (value == null || value === '') return null;
    return value;
  });

export const slugSchema = z
  .string()
  .trim()
  .min(3, 'Slug must be at least 3 characters ')
  .max(20, 'Slug must not exceed 20 characters')
  .refine((v) => !v.startsWith('-') && !v.endsWith('-'), {
    error: 'Slug cannot start or end with a hyphen',
  })
  .refine((v) => !v.includes('--'), {
    error: 'Slug cannot contain consecutive hyphens',
  })
  .refine((v) => !/\d/.test(v), {
    error: 'Slug must not contain numbers',
  })
  .refine((v) => v === v.toLowerCase(), {
    error: 'Slug must be all lowercase letters',
  })
  .refine((val) => /^[a-z-]+$/.test(val), {
    error: 'Slug must contain only lowercase letters and hyphens',
  });

export const updateCompanyVitalsSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(2, 'Legal name must be at least 2 characters')
    .max(256),
  companyType,
  yearEndDay: z.number().min(1).max(31),
  yearEndMonth: z.number().min(1).max(12),
  countryId: z.string().min(1, 'Select a country'),
  reportingCurrencyId: z.string().min(1, 'Select a reporting currency'),
  assignedFirmSlug: slugSchema.nullish(),
  displayName: z
    .string()
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(256)
    .nullish(),
  address: trimmedNullishFormString(512),
  companyLogo: trimmedNullishFormString(2048),
  description: trimmedNullishFormString(2000),
  website: trimmedNullishFormString(256),
  industry: trimmedNullishFormString(256),
  companySize: trimmedNullishFormString(256),
  revenue: trimmedNullishFormString(256),
  companyRegistrationNumber: trimmedNullishFormString(256),
  companyTaxId: trimmedNullishFormString(256),
  reportingFramework: reportingFramework.nullish(),
  accountingBasis: accountingBasis.nullish(),
  defaultTimezone: trimmedNullishTimezone,
});

export type UpdateCompanyVitalsFormValues = z.input<
  typeof updateCompanyVitalsSchema
>;
export type UpdateCompanyVitalsData = z.output<
  typeof updateCompanyVitalsSchema
>;
