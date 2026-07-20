import {
  PLATFORM_COA_TEMPLATE,
  VEYRA_COA_TEMPLATE,
} from '../../../domains/companies/workspace-provisioning.constants.js';

export type CanonicalWorkspaceKey = 'platform' | 'veyra-ng' | 'veyra-us';

export type CanonicalWorkspaceSeed = {
  key: CanonicalWorkspaceKey;
  id: string;
  legalName: string;
  displayName: string;
  shortCode: string;
  slug: string;
  countryCode: string;
  reportingCurrencyCode: string;
  defaultTimezone: string;
  reportingFramework: 'ifrs' | 'us_gaap';
  workspaceClass: 'platform' | 'partner';
  coaTemplateName: string;
};

export const PLATFORM_WORKSPACE_ID = 'a494b675-fedd-455c-ab6d-00ffdff9a047';

export const PLATFORM_WORKSPACE_LEGAL_NAME = 'Accountable Techserve Ltd';
export const PLATFORM_WORKSPACE_DISPLAY_NAME = 'Accountable HQ';
export const PLATFORM_WORKSPACE_SHORT_CODE = 'accX';

export const PLATFORM_WORKSPACE_SLUG = 'app';

export const VEYRA_NG_PARTNER_SLUG = 'veyra-ng';
export const VEYRA_US_PARTNER_SLUG = 'veyra-us';

export const VEYRA_NG_COMPANY_ID = '8a7b6c5d-4e3f-2a1b-9c0d-1e2f3a4b5c6d';

export const VEYRA_US_COMPANY_ID = '9b8c7d6e-5f4a-4b2c-9d1e-2f3a4b5c6d7e';

export const CANONICAL_WORKSPACES = [
  {
    key: 'platform',
    id: PLATFORM_WORKSPACE_ID,
    legalName: PLATFORM_WORKSPACE_LEGAL_NAME,
    displayName: PLATFORM_WORKSPACE_DISPLAY_NAME,
    shortCode: PLATFORM_WORKSPACE_SHORT_CODE,
    slug: PLATFORM_WORKSPACE_SLUG,
    countryCode: 'NG',
    reportingCurrencyCode: 'NGN',
    defaultTimezone: 'Africa/Lagos',
    reportingFramework: 'ifrs',
    workspaceClass: 'platform',
    coaTemplateName: PLATFORM_COA_TEMPLATE,
  },
  {
    key: 'veyra-ng',
    id: VEYRA_NG_COMPANY_ID,
    legalName: 'Veyra Advisory LLP',
    displayName: 'Veyra Advisory LLP',
    shortCode: 'veyraNG',
    slug: VEYRA_NG_PARTNER_SLUG,
    countryCode: 'NG',
    reportingCurrencyCode: 'NGN',
    defaultTimezone: 'Africa/Lagos',
    reportingFramework: 'ifrs',
    workspaceClass: 'partner',
    coaTemplateName: VEYRA_COA_TEMPLATE,
  },
  {
    key: 'veyra-us',
    id: VEYRA_US_COMPANY_ID,
    legalName: 'Veyra Advisory LLC',
    displayName: 'Veyra Advisory LLC',
    shortCode: 'veyraUS',
    slug: VEYRA_US_PARTNER_SLUG,
    countryCode: 'US',
    reportingCurrencyCode: 'USD',
    defaultTimezone: 'America/New_York',
    reportingFramework: 'us_gaap',
    workspaceClass: 'partner',
    coaTemplateName: VEYRA_COA_TEMPLATE,
  },
] as const satisfies readonly CanonicalWorkspaceSeed[];
