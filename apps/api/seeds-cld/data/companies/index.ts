import { INDIVIDUAL_CONFIG, INDIVIDUAL_DATA } from './individual.js';
import { BUSINESS_CONFIG, BUSINESS_DATA } from './business.js';
import { ACCOUNTING_FIRM_CONFIG, ACCOUNTING_FIRM_DATA } from './accounting-firm.js';
import type { CompanyTypeConfig } from '../../utils/types.js';

// Company type registry
export const COMPANY_TYPES: Record<string, CompanyTypeConfig> = {
  individual: INDIVIDUAL_CONFIG,
  business: BUSINESS_CONFIG,
  accounting_firm: ACCOUNTING_FIRM_CONFIG,
};

// Company data generators
export const COMPANY_DATA = {
  individual: INDIVIDUAL_DATA,
  business: BUSINESS_DATA,
  accounting_firm: ACCOUNTING_FIRM_DATA,
};

// Helper functions
export function getCompanyTypeConfig(
  companyType: 'individual' | 'business' | 'accounting_firm',
): CompanyTypeConfig {
  const config = COMPANY_TYPES[companyType];
  if (!config) {
    throw new Error(`Unsupported company type: ${companyType}`);
  }
  return config;
}

export function getCompanyData(companyType: 'individual' | 'business' | 'accounting_firm') {
  const data = COMPANY_DATA[companyType];
  if (!data) {
    throw new Error(`Unsupported company type: ${companyType}`);
  }
  return data;
}

export function validateCompanyType(
  type: string,
): type is 'individual' | 'business' | 'accounting_firm' {
  return ['individual', 'business', 'accounting_firm'].includes(type);
}

// Company type display names
export const COMPANY_TYPE_NAMES = {
  individual: 'Individual/Personal',
  business: 'Business/Company',
  accounting_firm: 'Accounting Firm',
};

// Export all company-specific data
export {
  INDIVIDUAL_CONFIG,
  INDIVIDUAL_DATA,
  BUSINESS_CONFIG,
  BUSINESS_DATA,
  ACCOUNTING_FIRM_CONFIG,
  ACCOUNTING_FIRM_DATA,
};
