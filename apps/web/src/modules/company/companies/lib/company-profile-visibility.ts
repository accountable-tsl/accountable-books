import type { CompanyType } from '@accountable-books/contracts/schema';

export type CompanyProfileVisibilityRules = {
  isBusiness: boolean;
  isAccountingFirm: boolean;
  isIndividual: boolean;
  showBusinessRegistrationFields: boolean;
  showBusinessContextFields: boolean;
};

export type SignupCompanyInfoVisibilityRules = CompanyProfileVisibilityRules & {
  showFirmSlugField: boolean;
  showIndustryField: boolean;
  showYearEndField: boolean;
  showOptionalFieldsToggle: boolean;
  showOptionalFieldsPanel: boolean;
  showTaxIdField: boolean;
};

export type SettingsCompanyProfileVisibilityRules =
  CompanyProfileVisibilityRules & {
    showRegistrationField: boolean;
    showTaxIdField: boolean;
    showBusinessContextSection: boolean;
  };

export function getCompanyProfileVisibilityRules(
  companyType: CompanyType | null | undefined,
): CompanyProfileVisibilityRules {
  const isBusiness = companyType === 'business';
  const isAccountingFirm = companyType === 'accounting_firm';
  const isIndividual = companyType === 'individual';

  return {
    isBusiness,
    isAccountingFirm,
    isIndividual,
    showBusinessRegistrationFields: !isIndividual,
    showBusinessContextFields: !isIndividual,
  };
}

export function getSignupCompanyInfoVisibilityRules(
  companyType: CompanyType | null | undefined,
): SignupCompanyInfoVisibilityRules {
  const base = getCompanyProfileVisibilityRules(companyType);

  return {
    ...base,
    showFirmSlugField: base.isAccountingFirm,
    showIndustryField: base.isBusiness,
    showYearEndField: base.isAccountingFirm,
    showOptionalFieldsToggle: !base.isIndividual,
    showOptionalFieldsPanel: !base.isIndividual,
    showTaxIdField: !base.isIndividual,
  };
}

export function getSettingsCompanyProfileVisibilityRules(
  companyType: CompanyType | null | undefined,
): SettingsCompanyProfileVisibilityRules {
  const base = getCompanyProfileVisibilityRules(companyType);

  return {
    ...base,
    showRegistrationField: base.showBusinessRegistrationFields,
    showTaxIdField: true,
    showBusinessContextSection: base.showBusinessContextFields,
  };
}
