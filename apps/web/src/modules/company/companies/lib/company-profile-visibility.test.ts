import { describe, expect, it } from 'vitest';

import {
  getCompanyProfileVisibilityRules,
  getSettingsCompanyProfileVisibilityRules,
  getSignupCompanyInfoVisibilityRules,
} from './company-profile-visibility';

describe('company profile visibility rules', () => {
  it('treats individuals as personal workspaces', () => {
    expect(getCompanyProfileVisibilityRules('individual')).toEqual({
      isBusiness: false,
      isAccountingFirm: false,
      isIndividual: true,
      showBusinessRegistrationFields: false,
      showBusinessContextFields: false,
    });
  });

  it('keeps signup business rules aligned with current flow', () => {
    expect(getSignupCompanyInfoVisibilityRules('business')).toMatchObject({
      isBusiness: true,
      isAccountingFirm: false,
      isIndividual: false,
      showFirmSlugField: false,
      showIndustryField: true,
      showYearEndField: false,
      showOptionalFieldsToggle: true,
      showOptionalFieldsPanel: true,
      showBusinessRegistrationFields: true,
      showTaxIdField: true,
    });
  });

  it('keeps signup accounting firm rules aligned with current flow', () => {
    expect(
      getSignupCompanyInfoVisibilityRules('accounting_firm'),
    ).toMatchObject({
      isBusiness: false,
      isAccountingFirm: true,
      isIndividual: false,
      showFirmSlugField: true,
      showIndustryField: false,
      showYearEndField: true,
      showOptionalFieldsToggle: true,
      showOptionalFieldsPanel: true,
      showBusinessRegistrationFields: true,
      showTaxIdField: true,
    });
  });

  it('hides registration but keeps tax id in settings for individuals', () => {
    expect(
      getSettingsCompanyProfileVisibilityRules('individual'),
    ).toMatchObject({
      isIndividual: true,
      showRegistrationField: false,
      showTaxIdField: true,
      showBusinessContextSection: false,
    });
  });
});
