import type { DemoCompanyConfig } from '../utils/types.js';
import { COUNTRIES, COUNTRY_IDS, CURRENCY_IDS } from './countries/index.js';
import { COMPANY_TYPES, COMPANY_TYPE_NAMES } from './companies/index.js';

// Master configuration for all 6 demo companies
export const DEMO_COMPANIES: DemoCompanyConfig[] = [
  // United States Companies
  {
    shortCode: 'us-individual',
    legalName: "John Smith's Finances",
    country: 'US',
    companyType: 'individual',
    user: {
      email: 'demo.us.individual@example.com',
      firstName: 'John',
      lastName: 'Smith',
    },
    dataScenarios: ['personal-finance'],
  },
  {
    shortCode: 'us-business',
    legalName: 'Smith Tech Solutions LLC',
    country: 'US',
    companyType: 'business',
    user: {
      email: 'demo.us.business@example.com',
      firstName: 'Sarah',
      lastName: 'Smith',
    },
    dataScenarios: ['tech-startup'],
  },
  {
    shortCode: 'us-firm',
    legalName: 'US Demo Accounting Firm',
    country: 'US',
    companyType: 'accounting_firm',
    user: {
      email: 'demo.us.firm@example.com',
      firstName: 'Michael',
      lastName: 'Johnson',
    },
    dataScenarios: ['professional-services'],
  },

  // Nigeria Companies
  {
    shortCode: 'ng-individual',
    legalName: "Adebayo's Personal Finance",
    country: 'NG',
    companyType: 'individual',
    user: {
      email: 'demo.ng.individual@example.com',
      firstName: 'Adebayo',
      lastName: 'Ogundimu',
    },
    dataScenarios: ['personal-finance'],
  },
  {
    shortCode: 'ng-business',
    legalName: 'Lagos Digital Solutions Ltd',
    country: 'NG',
    companyType: 'business',
    user: {
      email: 'demo.ng.business@example.com',
      firstName: 'Kemi',
      lastName: 'Adebayo',
    },
    dataScenarios: ['digital-business'],
  },
  {
    shortCode: 'ng-firm',
    legalName: 'Nigeria Demo Accounting Firm',
    country: 'NG',
    companyType: 'accounting_firm',
    user: {
      email: 'demo.ng.firm@example.com',
      firstName: 'Chinedu',
      lastName: 'Okafor',
    },
    dataScenarios: ['professional-services'],
  },
];

// Configuration validation
export function validateDemoCompanyConfig(config: DemoCompanyConfig): string[] {
  const errors: string[] = [];

  // Required fields
  if (!config.shortCode) errors.push('shortCode is required');
  if (!config.legalName) errors.push('legalName is required');
  if (!config.country) errors.push('country is required');
  if (!config.companyType) errors.push('companyType is required');
  if (!config.user?.email) errors.push('user.email is required');
  if (!config.user?.firstName) errors.push('user.firstName is required');

  // Valid values
  if (config.country && !COUNTRIES[config.country]) {
    errors.push(`Invalid country: ${config.country}`);
  }

  if (config.companyType && !COMPANY_TYPES[config.companyType]) {
    errors.push(`Invalid company type: ${config.companyType}`);
  }

  // Email format
  if (config.user?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.user.email)) {
    errors.push('Invalid email format');
  }

  // Unique constraints
  const allShortCodes = DEMO_COMPANIES.map((c) => c.shortCode);
  const duplicateShortCodes = allShortCodes.filter(
    (code, index) => allShortCodes.indexOf(code) !== index,
  );
  if (duplicateShortCodes.includes(config.shortCode)) {
    errors.push(`Duplicate shortCode: ${config.shortCode}`);
  }

  return errors;
}

// Helper functions for demo company management
export function getDemoCompany(shortCode: string): DemoCompanyConfig | undefined {
  return DEMO_COMPANIES.find((company) => company.shortCode === shortCode);
}

export function getDemoCompaniesByCountry(country: 'US' | 'NG'): DemoCompanyConfig[] {
  return DEMO_COMPANIES.filter((company) => company.country === country);
}

export function getDemoCompaniesByType(
  companyType: 'individual' | 'business' | 'accounting_firm',
): DemoCompanyConfig[] {
  return DEMO_COMPANIES.filter((company) => company.companyType === companyType);
}

export function getAllDemoCompanies(): DemoCompanyConfig[] {
  return [...DEMO_COMPANIES];
}

// Company creation configuration
export function buildCompanyCreationConfig(demoConfig: DemoCompanyConfig) {
  const countryConfig = COUNTRIES[demoConfig.country];
  const companyTypeConfig = COMPANY_TYPES[demoConfig.companyType];

  if (!countryConfig) {
    throw new Error(`Country configuration not found: ${demoConfig.country}`);
  }

  if (!companyTypeConfig) {
    throw new Error(`Company type configuration not found: ${demoConfig.companyType}`);
  }

  return {
    user: {
      firstname: demoConfig.user.firstName,
      lastname: demoConfig.user.lastName,
      email: demoConfig.user.email.toLowerCase(),
      password: 'DemoPassword123!', // Consistent demo password
      isDemoUser: true,
      emailVerifiedAt: new Date(),
    },
    company: {
      legalName: demoConfig.legalName,
      displayName: demoConfig.legalName,
      shortCode: demoConfig.shortCode,
      type: demoConfig.companyType,
      countryId: COUNTRY_IDS[demoConfig.country],
      reportingCurrencyId: CURRENCY_IDS[countryConfig.currency.code as 'USD' | 'NGN'],
      yearEndDay: 31,
      yearEndMonth: 12,
      accountingBasis: 'modified_accrual_basis' as const,
      reportingFramework: 'ifrs' as const,
      isDemoCompany: true,
    },
    metadata: {
      country: demoConfig.country,
      countryConfig,
      companyType: demoConfig.companyType,
      companyTypeConfig,
      dataScenarios: demoConfig.dataScenarios,
      displayName: COMPANY_TYPE_NAMES[demoConfig.companyType],
    },
  };
}

// Data volume configurations
export const DATA_VOLUME_PRESETS = {
  minimal: {
    transactions: 50,
    contacts: 10,
    projects: 3,
    monthsOfData: 6,
  },
  standard: {
    transactions: 150,
    contacts: 25,
    projects: 8,
    monthsOfData: 12,
  },
  extended: {
    transactions: 400,
    contacts: 50,
    projects: 15,
    monthsOfData: 24,
  },
} as const;

export type DataVolumePreset = keyof typeof DATA_VOLUME_PRESETS;

// Export summary information
export const DEMO_SUMMARY = {
  totalCompanies: DEMO_COMPANIES.length,
  countriesSupported: Object.keys(COUNTRIES).length,
  companyTypesSupported: Object.keys(COMPANY_TYPES).length,
  breakdown: {
    byCountry: {
      US: getDemoCompaniesByCountry('US').length,
      NG: getDemoCompaniesByCountry('NG').length,
    },
    byType: {
      individual: getDemoCompaniesByType('individual').length,
      business: getDemoCompaniesByType('business').length,
      accounting_firm: getDemoCompaniesByType('accounting_firm').length,
    },
  },
};

// Validate all demo company configurations on module load
const validationErrors = DEMO_COMPANIES.flatMap((config, index) =>
  validateDemoCompanyConfig(config).map(
    (error) => `Company ${index + 1} (${config.shortCode}): ${error}`,
  ),
);

if (validationErrors.length > 0) {
  console.warn('Demo company configuration validation errors:');
  validationErrors.forEach((error) => console.warn(`  - ${error}`));
}
