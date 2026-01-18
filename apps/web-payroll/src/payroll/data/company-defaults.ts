import { PAYROLL_TOOL_SCHEMA_VERSION } from '../domain';
import { getCurrentTimestamp } from '../utils';

import type { PayrollCompanyDefaults } from '../domain';

export const COMPANY_DEFAULTS: PayrollCompanyDefaults = {
  schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
  companyName: 'Company',
  settings: {
    defaultState: 'Lagos',
    statutoryDeductions: {
      pension: {
        enabled: true,
        employeeRate: 0.08, // 8%
        employerRate: 0.1, // 10%
      },
      nhf: {
        enabled: false, // Disabled by default
        employeeRate: 0.025, // 2.5% of Basic (rate defined but disabled)
      },
      nhis: {
        enabled: false, // Disabled by default
        employeeRate: 0.05, // 5% employee
        employerRate: 0.1, // 10% employer (rates defined but disabled)
      },
    },
    bhtBreakdown: {
      basic: 1,
    },
  },

  updatedAt: getCurrentTimestamp(),
};

export const DEMO_COMPANY_ID = 'de30ba11-5968-4e4d-9d6a-d810368b4fcb';

export const DEMO_COMPANY_DEFAULTS: PayrollCompanyDefaults = {
  ...COMPANY_DEFAULTS,
  companyId: DEMO_COMPANY_ID,
  companyName: 'Demo Company',
};

export const isDemoCompany = (id: string) => id === DEMO_COMPANY_ID;
