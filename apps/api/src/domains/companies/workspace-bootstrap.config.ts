import { ENV } from '../../config/env.js';
import { PLATFORM_COA_TEMPLATE } from './workspace-provisioning.constants.js';

import type { NewCompanyInput } from './companies.types.js';

export { PLATFORM_COA_TEMPLATE };

export const PLATFORM_WORKSPACE_ID =
  ENV.PLATFORM_COMPANY_ID ?? 'a494b675-fedd-455c-ab6d-00ffdff9a047';

export const PLATFORM_WORKSPACE_SHORT_CODE =
  ENV.PLATFORM_COMPANY_SHORT_CODE ?? 'accX';

export const PLATFORM_WORKSPACE_SLUG = 'app';
export {
  SYSTEM_USER_EMAIL,
  SYSTEM_USER_ID,
} from '../../bootstrap/phases/users.bootstrap.js';

export const VEYRA_NG_PARTNER_SLUG = 'veyra-ng';
export const VEYRA_US_PARTNER_SLUG = 'veyra-us';

export const VEYRA_NG_COMPANY_ID =
  process.env.VEYRA_NG_COMPANY_ID ?? '8a7b6c5d-4e3f-2a1b-9c0d-1e2f3a4b5c6d';

export const VEYRA_US_COMPANY_ID =
  process.env.VEYRA_US_COMPANY_ID ?? '9b8c7d6e-5f4a-4b2c-9d1e-2f3a4b5c6d7e';

export type BootstrapSystemFirmSeed = {
  id: string;
  legalName: string;
  displayName: string;
  shortCode: string;
  slug: string;
  countryId: string;
  reportingCurrencyId: string;
  defaultTimezone: string;
  reportingFramework: 'ifrs' | 'us_gaap';
};

export const BOOTSTRAP_SYSTEM_FIRMS: readonly BootstrapSystemFirmSeed[] = [
  {
    id: VEYRA_NG_COMPANY_ID,
    legalName: 'Veyra Advisory LLP',
    displayName: 'Veyra Advisory LLP',
    shortCode: 'veyraNG',
    slug: VEYRA_NG_PARTNER_SLUG,
    countryId: '84258bff-b7ab-4d9f-83f5-1bd1f4e39ace',
    reportingCurrencyId: '1d6a1e31-7e36-4eab-94e1-42f2173ea972',
    defaultTimezone: 'Africa/Lagos',
    reportingFramework: 'ifrs',
  },
  {
    id: VEYRA_US_COMPANY_ID,
    legalName: 'Veyra Advisory LLC',
    displayName: 'Veyra Advisory LLC',
    shortCode: 'veyraUS',
    slug: VEYRA_US_PARTNER_SLUG,
    countryId: '5a60ff99-bd7e-400e-84a6-ebb131789322',
    reportingCurrencyId: 'f3a1b0b1-c658-4af8-b5d0-b93467829a4d',
    defaultTimezone: 'America/New_York',
    reportingFramework: 'us_gaap',
  },
] as const;

const completeSeedOnboardingState = {
  steps: {
    company_details_confirmed: true,
    first_bank_account_added: true,
  },
  completed_at: {
    company_details_confirmed: new Date(),
    first_bank_account_added: new Date(),
  },
  metadata: null,
} as const;

export function buildPlatformWorkspaceSeed(
  adminUserId: string,
): NewCompanyInput & {
  slug: string;
  firm_type: null;
  coa_template_name: string;
} {
  return {
    id: PLATFORM_WORKSPACE_ID,
    legal_name: ENV.PLATFORM_COMPANY_NAME ?? 'Accountable Techserve Ltd',
    display_name: 'Accountable HQ',
    type: 'accounting_firm',
    country_id: '84258bff-b7ab-4d9f-83f5-1bd1f4e39ace',
    default_timezone: 'Africa/Lagos',
    reporting_currency_id: '1d6a1e31-7e36-4eab-94e1-42f2173ea972',
    created_by_id: adminUserId,
    short_code: PLATFORM_WORKSPACE_SHORT_CODE,
    website: 'getaccountable.com',
    year_end_day: 31,
    year_end_month: 12,
    reporting_framework: 'ifrs',
    workspace_class: 'platform',
    accounting_basis: 'modified_accrual_basis',
    onboarding_state: completeSeedOnboardingState,
    slug: PLATFORM_WORKSPACE_SLUG,
    firm_type: null,
    coa_template_name: PLATFORM_COA_TEMPLATE,
  };
}
