import { z } from 'zod';

import { dbBaseFields } from '../../core/types/core.js';
import { companyOnboardingState } from '../../features/onboarding/onboarding.types.js';
import { type SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';
import { firmType } from '../accountingFirms/firms.types.js';

export const companyType = z.enum([
  'business',
  'individual',
  'accounting_firm',
]);
export const reportingFramework = z.enum(['ifrs', 'us_gaap']);
export const accountingBasis = z.enum([
  'modified_cash_basis',
  'modified_accrual_basis',
]);

export const newCompanyInput = z.object({
  id: z.uuid().optional(),
  legal_name: z.string().min(2).max(256),
  country_code: z.string().max(3).optional(),
  country_id: z.uuid().optional(),
  type: companyType,
  reporting_currency_code: z.string().max(3).optional(),
  reporting_currency_id: z.uuid().optional(),
  accounting_basis: accountingBasis.optional(),

  display_name: z.string().max(256).optional(),
  year_end_day: z.coerce.number().optional(),
  year_end_month: z.coerce.number().optional(),
  created_by_id: z.uuid().optional(),
  last_updated_by_id: z.uuid().optional(),
  address: z.string().max(512).nullish(),
  logo_url: z.string().nullish(),
  logo_key: z.string().nullish(),
  description: z.string().max(2000).nullish(),
  website: z.string().max(256).nullish(),
  industry: z.string().max(256).nullish(),
  team_size: z.string().max(256).nullish(),
  revenue: z.string().max(256).nullish(),
  reporting_framework: reportingFramework.nullish(),
  short_code: z.string().max(50).optional(),
  assigned_firm_id: z.uuid().optional(),
  load_coa_template: z.boolean().optional(),
  registration_number: z.string().max(256).nullish(),
  tax_id: z.string().max(256).nullish(),
  is_demo_company: z.boolean().prefault(false).optional(),
  slug: z.string().max(20).optional(),
  onboarding_state: companyOnboardingState.optional(),
});

export const newCompany = newCompanyInput
  .extend({
    display_name: z.string().max(256), // legal_name
    country_id: z.uuid(),
    reporting_currency_id: z.uuid(),
    accounting_basis: accountingBasis,
    short_code: z.string().max(50),
    year_end_day: z.coerce.number(),
    year_end_month: z.coerce.number(),
    created_by_id: z.uuid(),
    created_at: z.date().optional(),
    updated_at: z.date().optional(),
    is_demo_company: z.boolean().prefault(false),
    is_platform: z.boolean().prefault(false).optional(),
    conversion_date: z.date().nullish(),
  })
  .omit({ slug: true });

export const company = z.object({
  ...newCompany.shape,
  ...dbBaseFields.shape,
});

export type CompanyType = z.infer<typeof companyType>;
export type ReportingFramework = z.infer<typeof reportingFramework>;
export type AccountingBasis = z.infer<typeof accountingBasis>;
export type NewCompanyInput = z.infer<typeof newCompanyInput>;
export type NewCompany = z.infer<typeof newCompany>;
export type Company = z.infer<typeof company>;

export type NewCompanyInputCamel = SnakeToCamelCaseObject<NewCompanyInput>;

export const getCompanyResponse = z.object({
  id: z.uuid(),
  legalName: z.string(),
  companyType: companyType,
  yearEndDay: z.number(),
  yearEndMonth: z.number(),
  countryId: z.uuid(),
  reportingCurrencyId: z.uuid(),
  createdById: z.uuid(),

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
  accountingBasis: accountingBasis,
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

export type GetCompanyResponse = {
  id: string; // This is short code
  legalName: string;
  companyType: CompanyType;
  yearEndDay: number;
  yearEndMonth: number;
  countryId: string;
  reportingCurrencyId: string;
  createdById: string;
  createdAt: Date;

  displayName: string | null;
  address: string | null;
  companyLogo: string | null;
  companyLogoKey: string | null;
  description: string | null;
  website: string | null;
  industry: string | null;
  companySize: string | null;
  revenue: string | null;
  companyRegistrationNumber: string | null;
  companyTaxId: string | null;
  isPlatform?: boolean;

  countryCode: string | null;
  countryName: string | null;
  countryPhoneCode: string | null;
  countryFlag: string | null;
  countryContinent: string | null;

  reportingFramework: ReportingFramework | null;
  accountingBasis: AccountingBasis;
  // onboardingStatus: OnboardingStatus;
  isDemoCompany: boolean;

  reportingCurrencyCode: string;
  reportingCurrencyName: string;
  reportingCurrencySymbol: string | null;

  assignedFirmId: string | null;
  assignedFirmName: string | null;
  assignedFirmSlug: string | null;
  assignedFirmIsPlatform: boolean | null;
  assignedFirmLogo: string | null;
};

export const fieldToColumnMap: Partial<
  Record<keyof GetCompanyResponse, keyof NewCompany>
> = {
  legalName: 'legal_name',
  companyType: 'type',
  yearEndDay: 'year_end_day',
  yearEndMonth: 'year_end_month',
  countryId: 'country_id',
  reportingCurrencyId: 'reporting_currency_id',
  createdById: 'created_by_id',
  createdAt: 'created_at',

  displayName: 'display_name',
  address: 'address',
  companyLogo: 'logo_url',
  companyLogoKey: 'logo_key',
  description: 'description',
  website: 'website',
  industry: 'industry',
  companySize: 'team_size',
  revenue: 'revenue',
  companyRegistrationNumber: 'registration_number',
  companyTaxId: 'tax_id',
  isPlatform: 'is_platform',
  isDemoCompany: 'is_demo_company',
  // onboardingStatus: "onboarding_status",

  reportingFramework: 'reporting_framework',
  accountingBasis: 'accounting_basis',

  assignedFirmId: 'assigned_firm_id',
};

export const updateCompanySchema = getCompanyResponse
  .omit({
    id: true,
    createdById: true,
    isPlatform: true,
    isDemoCompany: true,
    assignedFirmIsPlatform: true,
    assignedFirmLogo: true,
    assignedFirmName: true,
    assignedFirmSlug: true,
  })
  .extend({
    slug: z.string().max(20).optional(),
    firmType: firmType.optional(),
  })
  .partial();

export type UpdateCompanySchema = z.infer<typeof updateCompanySchema>;

export interface CompanyFilters {
  companyType?: CompanyType[];
  country?: string;
  assignedFirm?: string;
  isDemoCompany?: boolean;
}

export interface FetchCompaniesOptions {
  identifiers?: string[];
  filters?: CompanyFilters;
  // Future extensions
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
