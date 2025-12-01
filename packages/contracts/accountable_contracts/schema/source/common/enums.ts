import z from 'zod';

export const companyType = z.enum([
  'business',
  'individual',
  'accounting_firm',
]);
export type CompanyType = z.infer<typeof companyType>;

export const reportingFramework = z.enum(['ifrs', 'us_gaap']);
export type ReportingFramework = z.infer<typeof reportingFramework>;

export const accountingBasis = z.enum([
  'modified_cash_basis',
  'modified_accrual_basis',
]);
export type AccountingBasis = z.infer<typeof accountingBasis>;

export const contactType = z.enum([
  'customer', // anyone you invoice/collect money from; AR
  'vendor', // suppliers, service providers, card networks, AP;
  'employee', // payroll beneficiaries; distinct from contractors for compliance.
  'contractor', // freelancers/consultants you pay but who aren't employees.
  'director', // board/management contacts tied to governance (minutes, approvals)
  'owner', // equity holders or principal partners
  'government', // tax authorities, regulators, statutory bodies, etc
  'internal', // company-controlled accounts/entities
  'banker',
  'other',
]);

export const labelRole = z.enum([
  'semantic', // Account types that represent business concepts (trainable)
  'mechanical', // System-generated accounts (not trainable, e.g., contra accounts)
  'control', // Control accounts for posting (e.g., bank, AR, AP)
  'fallback', // Catch-all accounts for ambiguous transactions
]);
export type LabelRole = z.infer<typeof labelRole>;
