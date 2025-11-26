import z from 'zod';

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

export const contactType = z.enum([
  'customer', // anyone you invoice/collect money from; AR
  'vendor', // suppliers, service providers, card networks, AP;
  'employee', // payroll beneficiaries; distinct from contractors for compliance.
  'contractor', // freelancers/consultants you pay but who aren’t employees.
  'director', // board/management contacts tied to governance (minutes, approvals)
  'owner', // equity holders or principal partners
  'government', // tax authorities, regulators, statutory bodies, etc
  'internal', // company-controlled accounts/entities
  'banker',
  'other',
]);
