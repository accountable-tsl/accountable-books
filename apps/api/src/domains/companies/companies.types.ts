import type { CompanyType } from '@accountable-books/contracts/schema';
import {
  accountingBasis,
  companyType,
  updateCompanyPayload as contractUpdateCompanySchema,
  companyResponse as getCompanyResponse,
  reportingFramework,
  workspaceClass,
} from '@accountable-books/contracts/schema';
import {
  isKnownTimezone,
  normalizeTimezoneId,
} from '@accountable-books/utils/timezone';
import { z } from 'zod';

import { dbBaseFields } from '../../core/types/core.js';
import { companyOnboardingState } from '../../features/onboarding/onboarding.types.js';
import { type SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';

export {
  companyVerificationClaim,
  companyVerification,
} from '@accountable-books/contracts/schema';

export type {
  WorkspaceClass,
  CompanyType,
  AccountingBasis,
  ReportingFramework,
  CompanyVerificationClaim,
  CompanyVerification,
} from '@accountable-books/contracts/schema';

const trimmedOptionalString = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    }
    return value;
  }, z.string().max(max).optional());

const trimmedNullishString = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    }
    return value;
  }, z.string().max(max).nullable().optional());

const trimmedOptionalTimezone = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    }
    return value;
  },
  z
    .string()
    .refine(isKnownTimezone, 'Use a valid IANA timezone')
    .transform((value) => normalizeTimezoneId(value) ?? value)
    .optional(),
);

export {
  accountingBasis,
  companyType,
  getCompanyResponse,
  reportingFramework,
  workspaceClass,
};

export const newCompanyInput = z.object({
  id: z.uuid().optional(),
  legal_name: z.string().trim().min(2).max(256),
  country_code: trimmedOptionalString(3),
  country_id: z.uuid().optional(),
  type: companyType,
  reporting_currency_code: trimmedOptionalString(3),
  reporting_currency_id: z.uuid().optional(),
  accounting_basis: accountingBasis.optional(),

  display_name: trimmedOptionalString(256),
  year_end_day: z.coerce.number().optional(),
  year_end_month: z.coerce.number().optional(),
  created_by_id: z.uuid().optional(),
  last_updated_by_id: z.uuid().nullish(),
  address: trimmedNullishString(512),
  logo_file_id: z.uuid().nullish(),
  description: trimmedNullishString(2000),
  website: trimmedNullishString(256),
  industry: trimmedNullishString(256),
  team_size: trimmedNullishString(256),
  revenue: trimmedNullishString(256),
  reporting_framework: reportingFramework.nullish(),
  short_code: trimmedOptionalString(50),
  assigned_firm_id: z.uuid().nullish(),
  load_coa_template: z.boolean().optional(),
  registration_number: trimmedNullishString(256),
  tax_id: trimmedNullishString(256),
  default_timezone: trimmedOptionalTimezone,
  workspace_class: workspaceClass.prefault('customer').optional(),
  slug: trimmedOptionalString(20),
  onboarding_state: companyOnboardingState.optional(),
});

export const updateCompanySchema = contractUpdateCompanySchema.extend({
  defaultTimezone: z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length === 0 ? undefined : trimmed;
      }
      return value;
    },
    z
      .string()
      .refine(isKnownTimezone, 'Use a valid IANA timezone')
      .transform((value) => normalizeTimezoneId(value) ?? value)
      .optional(),
  ),
});

export const newCompany = newCompanyInput
  .extend({
    display_name: z.string().max(256),
    country_id: z.uuid(),
    reporting_currency_id: z.uuid(),
    accounting_basis: accountingBasis,
    short_code: z.string().max(50),
    year_end_day: z.coerce.number(),
    year_end_month: z.coerce.number(),
    created_by_id: z.uuid(),
    created_at: z.date().optional(),
    updated_at: z.date().optional(),
    workspace_class: workspaceClass.prefault('customer'),
    conversion_date: z.date().nullish(),
  })
  .omit({ slug: true });

export const company = z.object({
  ...newCompany.shape,
  ...dbBaseFields.shape,
});

export type NewCompanyInput = z.infer<typeof newCompanyInput>;
export type NewCompany = z.infer<typeof newCompany>;
export type Company = z.infer<typeof company>;
export type GetCompanyResponse = z.infer<typeof getCompanyResponse>;
export type UpdateCompanySchema = z.infer<typeof updateCompanySchema>;

export type NewCompanyInputCamel = SnakeToCamelCaseObject<NewCompanyInput>;

type CompanyUpdatableColumnField = Exclude<
  keyof UpdateCompanySchema,
  'slug' | 'firmType'
>;

export const fieldToColumnMap: Partial<
  Record<CompanyUpdatableColumnField, keyof NewCompany>
> = {
  legalName: 'legal_name',
  companyType: 'type',
  yearEndDay: 'year_end_day',
  yearEndMonth: 'year_end_month',
  countryId: 'country_id',
  reportingCurrencyId: 'reporting_currency_id',
  displayName: 'display_name',
  address: 'address',
  description: 'description',
  website: 'website',
  industry: 'industry',
  companySize: 'team_size',
  revenue: 'revenue',
  companyRegistrationNumber: 'registration_number',
  companyTaxId: 'tax_id',
  reportingFramework: 'reporting_framework',
  accountingBasis: 'accounting_basis',
  assignedFirmId: 'assigned_firm_id',
  defaultTimezone: 'default_timezone',
};

export interface CompanyFilters {
  companyType?: CompanyType[];
  country?: string;
  assignedFirm?: string;
  isDemoCompany?: boolean;
}

export interface FetchCompaniesOptions {
  identifiers?: string[];
  filters?: CompanyFilters;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
