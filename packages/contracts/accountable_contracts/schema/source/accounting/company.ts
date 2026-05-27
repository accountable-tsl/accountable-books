import { z } from 'zod';

import {
  accountingBasis,
  companyType,
  firmType,
  reportingFramework,
  workspaceClass,
} from '../common/enums.js';

const isValidWireTimezone = (timezone?: string | null): boolean => {
  const trimmed = timezone?.trim();
  if (!trimmed) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
};

const wireTimezoneSchema = z
  .string()
  .trim()
  .refine(
    isValidWireTimezone,
    'Use a valid IANA timezone (e.g. America/New_York)',
  );

const isoDateTimeSchema = z.preprocess((value) => {
  if (value instanceof Date) return value.toISOString();
  return value;
}, z.iso.datetime());

const isoDateTimeNullishSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (value instanceof Date) return value.toISOString();
    return value;
  },
  z.union([z.iso.datetime(), z.null()]),
);

const trimmedOptionalString = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    }
    return value;
  }, z.string().max(max).optional());

const trimmedNullableString = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    }
    return value;
  }, z.string().max(max).nullable());

const trimmedOptionalTimezone = z.preprocess((value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return value;
}, wireTimezoneSchema.optional());

export const companyOnboardingState = z
  .object({
    steps: z.object({
      company_details_confirmed: z.boolean().nullish(),
      first_bank_account_added: z.boolean().nullish(),
    }),
    completed_at: z
      .object({
        company_details_confirmed: isoDateTimeNullishSchema,
        first_bank_account_added: isoDateTimeNullishSchema,
      })
      .optional(),
    metadata: z.null().nullish(),
  })
  .nullish();
export type CompanyOnboardingState = z.infer<typeof companyOnboardingState>;

export const companyVerificationClaim = z.object({
  verifiedAt: isoDateTimeNullishSchema,
});
export type CompanyVerificationClaim = z.infer<typeof companyVerificationClaim>;

export const companyVerification = z.object({
  legalName: companyVerificationClaim,
  address: companyVerificationClaim,
  registrationNumber: companyVerificationClaim,
  taxId: companyVerificationClaim,
});
export type CompanyVerification = z.infer<typeof companyVerification>;

export const companyResponse = z.object({
  id: z.string().max(50),
  legalName: z.string(),
  companyType,
  workspaceClass,
  yearEndDay: z.number().min(1).max(31),
  yearEndMonth: z.number().min(1).max(12),
  countryId: z.uuid(),
  reportingCurrencyId: z.uuid(),
  createdById: z.uuid(),
  createdAt: isoDateTimeSchema,
  defaultTimezone: wireTimezoneSchema,
  verification: companyVerification,
  displayName: z.string().nullable(),
  address: z.string().nullable(),
  companyLogo: z.string().nullable(),
  companyLogoKey: z.string().nullable(),
  description: z.string().nullable(),
  website: z.string().nullable(),
  industry: z.string().nullable(),
  companySize: z.string().nullable(),
  revenue: z.string().nullable(),
  companyRegistrationNumber: z.string().nullable(),
  companyTaxId: z.string().nullable(),
  isPlatform: z.boolean(),
  countryCode: z.string().nullable(),
  countryName: z.string().nullable(),
  countryPhoneCode: z.string().nullable(),
  countryFlag: z.string().nullable(),
  countryContinent: z.string().nullable(),
  reportingFramework: reportingFramework.nullable(),
  accountingBasis,
  onboardingState: companyOnboardingState,
  isDemoCompany: z.boolean(),
  reportingCurrencyCode: z.string(),
  reportingCurrencyName: z.string(),
  reportingCurrencySymbol: z.string().nullable(),
  assignedFirmId: z.uuid().nullable(),
  assignedFirmName: z.string().nullable(),
  assignedFirmSlug: z.string().nullable(),
  assignedFirmIsPlatform: z.boolean().nullable(),
  assignedFirmLogo: z.string().nullable(),
});
export type CompanyResponse = z.infer<typeof companyResponse>;

export const updateCompanyPayload = z.object({
  legalName: z.string().trim().min(2).max(256).optional(),
  companyType: companyType.optional(),
  yearEndDay: z.coerce.number().min(1).max(31).optional(),
  yearEndMonth: z.coerce.number().min(1).max(12).optional(),
  countryId: z.uuid().optional(),
  reportingCurrencyId: z.uuid().optional(),
  displayName: trimmedNullableString(256).optional(),
  address: trimmedNullableString(512).optional(),
  description: trimmedNullableString(2000).optional(),
  website: trimmedNullableString(256).optional(),
  industry: trimmedNullableString(256).optional(),
  companySize: trimmedNullableString(256).optional(),
  revenue: trimmedNullableString(256).optional(),
  companyRegistrationNumber: trimmedNullableString(256).optional(),
  companyTaxId: trimmedNullableString(256).optional(),
  reportingFramework: reportingFramework.nullish(),
  accountingBasis: accountingBasis.optional(),
  assignedFirmId: z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    }
    return value;
  }, z.uuid().nullable().optional()),
  defaultTimezone: trimmedOptionalTimezone,
  slug: trimmedOptionalString(20),
  firmType: firmType.optional(),
});
export type UpdateCompanyPayload = z.infer<typeof updateCompanyPayload>;
