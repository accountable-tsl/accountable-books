import type {
  AccountingBasis,
  CompanyType,
  ReportingFramework,
} from '@accountable-books/contracts/schema';

export const COMPANY_TYPES: {
  key: CompanyType;
  type: string;
  description: string;
  idealFor: string;
  icon: string;
}[] = [
  {
    key: 'business',
    type: 'Business',
    description: 'I run a business and want to manage its finances',
    idealFor: 'Founders, Business Owners',
    icon: '🏢',
  },
  {
    key: 'accounting_firm',
    type: 'Accounting Firm',
    description: 'I provide accounting services to clients',
    idealFor: 'Accounting firms, freelance bookkeepers',
    icon: '🧑‍💻',
  },
  {
    key: 'individual',
    type: 'Individual',
    description: 'I want to track my personal expenses',
    idealFor: 'Individuals, Students, Personal Finance Enthusiasts',
    icon: '👤',
  },
];

export const COMPANY_SIZE = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-500', label: '51-500 employees' },
  { value: '501-2000', label: '501-2000 employees' },
  { value: '2000+', label: '2000+ employees' },
];

export const ACCOUNTING_BASIS = [
  { value: 'modified_cash_basis', label: 'Modified Cash Basis' },
  { value: 'modified_accrual_basis', label: 'Modified Accrual Basis' },
];

export const REPORTING_FRAMEWORK_LABELS: Record<ReportingFramework, string> = {
  ifrs: 'IFRS',
  us_gaap: 'US GAAP',
};

export const ACCOUNTING_BASIS_LABELS: Record<AccountingBasis, string> = {
  modified_cash_basis: 'Modified Cash Basis',
  modified_accrual_basis: 'Modified Accrual Basis',
};

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  business: 'Business',
  individual: 'Individual',
  accounting_firm: 'Accounting Firm',
};

export function getReportingFrameworkLabel(
  value: ReportingFramework | null | undefined,
): string {
  if (!value) return 'Not set';
  return REPORTING_FRAMEWORK_LABELS[value] ?? value;
}

export function getAccountingBasisLabel(
  value: AccountingBasis | null | undefined,
): string {
  if (!value) return 'Not set';
  return ACCOUNTING_BASIS_LABELS[value] ?? value;
}

export function getCompanyTypeLabel(
  value: CompanyType | null | undefined,
): string {
  if (!value) return 'Not set';
  return COMPANY_TYPE_LABELS[value] ?? value;
}

export const COMPANY_REVENUE_RANGE = [
  { value: 'pre-revenue', label: 'Pre-revenue' },
  { value: '1-100000', label: '$1 - $100,000' },
  { value: '100001-500000', label: '$100,001 - $500,000' },
  { value: '500001-1000000', label: '$500,001 - $1,000,000' },
  { value: '1000001-5000000', label: '$1,000,001 - $5,000,000' },
  { value: '5000001-10000000', label: '$5,000,001 - $10,000,000' },
  { value: '10000001-50000000', label: '$10,000,001 - $50,000,000' },
  { value: '50000001-100000000', label: '$50,000,001 - $100,000,000' },
  { value: 'over-100000000', label: 'Over $100,000,000' },
];

export const DEMO_COMPANIES_IDS: Record<CompanyType, string> = {
  individual: 'indDemo',
  accounting_firm: 'firmDemo',
  business: 'bizDemo',
};
