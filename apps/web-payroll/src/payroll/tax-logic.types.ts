import type { StateValue } from "./data/states";

export type IsoDateString = string; // YYYY-MM-DD
export type PayrollMonth = string; // YYYY-MM

export type EmploymentProrationMethod =
  | 'full_month' // any employment in the month => 1, else 0
  | 'calendar_days' // calendar-day proration (default when join/exit exists)
  | 'business_days' // Mon–Fri proration
  | 'thirty_360'; // 30-day month proration (30/360-style)

export type CompensationBreakdown = {
  breakdownType: 'percentage' | 'amount'; // percentage => 0..1, amount => annual NGN
  basicValue: number;
  housingValue: number;
  transportValue: number;
};

export type CompensationRecord = {
  fromMonth: PayrollMonth;
  toMonth?: PayrollMonth;
  annualGross: number; // NGN/year
  annualRent?: number; // NGN/year (optional)
  breakdown?: CompensationBreakdown;
};

export type StatutoryConfigRecord = {
  fromMonth: PayrollMonth;
  toMonth?: PayrollMonth;
  hasPension?: boolean; // undefined => inherit company default
  hasNHF?: boolean; // undefined => inherit company default
  hasNHIS?: boolean; // undefined => inherit company default

  /** Optional employee-specific pension rates for this period. */
  pensionRates?: PensionRates;

  /** Optional employee-specific NHIS rates for this period. */
  nhisRates?: NhisRates;
};

export type PensionRates = {
  employeeRate: number; // 0..1 (e.g. 0.08)
  employerRate: number; // 0..1 (e.g. 0.10)
};

export type NhisRates = {
  employeeRate: number; // 0..1
  employerRate: number; // 0..1
};

/**
 * Company-level statutory defaults. Employees can still override enablement via `Employee.statutory`,
 * but rates come from company policy (for now).
 */
export type StatutoryDefaults = {
  hasPension?: boolean;
  hasNHF?: boolean;
  hasNHIS?: boolean;

  pensionRates?: PensionRates;
  nhisRates?: NhisRates;
};

export type AllowableDeductionType =
  | 'pension_additional'
  | 'nhis_additional'
  | 'owner_occupied_mortgage_interest'
  | 'life_insurance_premium';

export type AllowableDeductionSchedule = {
  type: AllowableDeductionType;
  amount: number; // NGN (per `frequency`)
  frequency: 'monthly' | 'once';
  fromMonth: PayrollMonth;
  toMonth?: PayrollMonth; // omit for a single month when `frequency: 'once'`
};

export type EmployerVoluntarySchedule = {
  type: 'nhis_voluntary' | 'pension_voluntary';
  amount: number; // NGN (per `frequency`)
  frequency: 'monthly' | 'once';
  fromMonth: PayrollMonth;
  toMonth?: PayrollMonth; // omit for a single month when `frequency: 'once'`
};

export interface Employee {
  id: string;
  name: string;
  role?: string;
  email?: string;
  staffId?: string;
  department?: string;

  state: StateValue; // Nigerian state for PAYE remittance

  bankName?: string;
  accountNumber?: string;

  joinDate?: IsoDateString;
  exitDate?: IsoDateString;

  compensation: CompensationRecord[]; // details of employee emoluments (at least one period)
  statutory?: StatutoryConfigRecord[]; // optional; defaults handled by payroll policy
  allowableDeductions?: AllowableDeductionSchedule[]; // expenses made by the employee that are tax-deductible
  employerVoluntaryContributions?: EmployerVoluntarySchedule[]; // employer-side costs / benefits
}

export type EmployeeMonthDeductions = Record<AllowableDeductionType, number>;

export type EmployerVoluntaryType = 'nhis_voluntary' | 'pension_voluntary';

export type EmployeeMonthEmployerContributions = Record<
  EmployerVoluntaryType,
  number
>;

export type EmployeeMonthCompensation = {
  month: PayrollMonth;

  annualGross: number;
  annualRent: number;

  annualBasic: number;
  annualHousing: number;
  annualTransport: number;
  annualOtherAllowances: number;

  monthlyGross: number;
  monthlyBasic: number;
  monthlyHousing: number;
  monthlyTransport: number;
  monthlyOtherAllowances: number;

  employmentFraction: number; // 0..1 (calendar-day proration for join/exit within the month)
};

export type EmployeeMonthStatutory = {
  hasPension: boolean;
  hasNHF: boolean;
  hasNHIS: boolean;

  eePension: number; // NGN/month
  erPension: number; // NGN/month
  eeNhf: number; // NGN/month
  eeNhis: number; // NGN/month
  erNhis: number; // NGN/month
};

export type EmployeeMonthInputs = {
  employeeId: string;
  month: PayrollMonth;
  compensation: EmployeeMonthCompensation;
  statutory: EmployeeMonthStatutory;
  deductions: EmployeeMonthDeductions;
  employerContributions: EmployeeMonthEmployerContributions;
};

export type NigeriaCumulativePayeMonthResult = {
  month: PayrollMonth;
  monthNumber: number; // 1..12

  grossYtd: number;
  projectedAnnualGross: number;

  employerPaidYtd: number;
  projectedAnnualEmployerPaid: number;
  projectedAnnualGrossAfterEmployerPaid: number;

  rentPaidYtd: number;
  projectedAnnualRentPaid: number;
  rentRelief: number; // min(20% of rent paid, 500,000)

  allowableRecurringYtd: number;
  allowableOneOffYtd: number;
  projectedAnnualAllowableRecurring: number;
  projectedAnnualAllowableTotal: number;

  projectedAnnualTaxableIncome: number;
  projectedAnnualTax: number;

  taxDueYtd: number;
  taxWithheldYtdBeforeThisMonth: number;
  payeThisMonth: number;
  taxWithheldYtdAfterThisMonth: number;
};
