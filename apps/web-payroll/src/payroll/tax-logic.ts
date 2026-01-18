import {
  assertValidPayrollMonth,
  getEmploymentFractionForMonth,
  listMonthsFromJanuaryTo,
  monthInRange,
  pickSinglePeriod,
  resolveRatePair,
} from './tax-logic.utils';

import type {
  AllowableDeductionSchedule,
  AllowableDeductionType,
  CompensationBreakdown,
  CompensationRecord,
  Employee,
  EmployeeMonthDeductions,
  EmployeeMonthEmployerContributions,
  EmployeeMonthInputs,
  EmployerVoluntarySchedule,
  EmployerVoluntaryType,
  EmploymentProrationMethod,
  NigeriaCumulativePayeMonthResult,
  PayrollMonth,
  StatutoryConfigRecord,
  StatutoryDefaults,
} from './tax-logic.types';

/**
 * ## Public surface (start here)
 *
 * Core “buckets” we model:
 * - **statutory**: computed statutory contributions/withholdings for this month (pension, NHF, NHIS, etc.)
 * - **deductions**: employee scheduled deductions (non-statutory items we track as schedules)
 * - **employerContributions**: employer scheduled contributions/benefits (do not reduce employee net)
 *
 * Primary entry points:
 * - `computeEmployeeMonthInputs(employee, month, companyDefaults?, options?)`
 * - `computeNigeriaCumulativePayeForMonth(employee, month, companyDefaults?, options?)`
 *
 * Helpers used by UI/tests:
 * - `getEmployeeCompensationForMonth`, `getEmployeeStatutoryForMonth`
 * - `getEmployeeDeductionsForMonth`, `getEmployerContributionsForMonth`
 */
export type {
  AllowableDeductionSchedule,
  AllowableDeductionType,
  CompensationBreakdown,
  CompensationRecord,
  Employee,
  EmploymentProrationMethod,
  EmployeeMonthCompensation,
  EmployeeMonthDeductions,
  EmployeeMonthEmployerContributions,
  EmployeeMonthInputs,
  EmployeeMonthStatutory,
  EmployerVoluntarySchedule,
  EmployerVoluntaryType,
  IsoDateString,
  NigeriaCumulativePayeMonthResult,
  PayrollMonth,
  StatutoryConfigRecord,
} from './tax-logic.types';

// 2026 Nigerian Tax Bands (Fourth Schedule, Section 58)
export const TAX_RULESET_KEY = 'NG-2026-v1';

export const TAX_BANDS = [
  { min: 0, max: 800000, rate: 0 },
  { min: 800000, max: 3000000, rate: 0.15 },
  { min: 3000000, max: 12000000, rate: 0.18 },
  { min: 12000000, max: 25000000, rate: 0.21 },
  { min: 25000000, max: 50000000, rate: 0.23 },
  { min: 50000000, max: Number.POSITIVE_INFINITY, rate: 0.25 },
];

// -----------------------------------------------------------------------------
// Statutory constants & policy thresholds
// -----------------------------------------------------------------------------

// Statutory Rates (Orgs might override these or employee might have overrides)
// Any rates higher than these will be considered additional contributions in payrun.
const MIN_EE_PENSION_RATE = 0.08; // 8% of Basic+Housing+Transport
const MIN_ER_PENSION_RATE = 0.1; // 10% of Basic+Housing+Transport
const MIN_TOTAL_PENSION_RATE = 0.18;

const EE_NHF_RATE = 0.025; // 2.5% of Basic

// NHIS standard split (employee 5%, employer 10%) when enabled.
const MIN_ER_NHIS_RATE = 0.1;
const MIN_TOTAL_NHIS_RATE = 0.15;
const DEFAULT_EE_NHIS_RATE = 0.05;
const DEFAULT_ER_NHIS_RATE = 0.1;

// -----------------------------------------------------------------------------
// Schedule expansion (employee deductions / employer contributions)
// -----------------------------------------------------------------------------

type AllowableScheduleLike = {
  type: AllowableDeductionType;
  amount: number;
  frequency: 'monthly' | 'once';
  fromMonth: PayrollMonth;
  toMonth?: PayrollMonth;
};

type EmployerVoluntaryScheduleLike = {
  type: EmployerVoluntaryType;
  amount: number;
  frequency: 'monthly' | 'once';
  fromMonth: PayrollMonth;
  toMonth?: PayrollMonth;
};

const EMPTY_ALLOWABLE_TOTALS: EmployeeMonthDeductions = {
  pension_additional: 0,
  nhis_additional: 0,
  owner_occupied_mortgage_interest: 0,
  life_insurance_premium: 0,
};

const EMPTY_EMPLOYER_VOLUNTARY_TOTALS: EmployeeMonthEmployerContributions = {
  nhis_voluntary: 0,
  pension_voluntary: 0,
};

function initAllowableTotals(): EmployeeMonthDeductions {
  return { ...EMPTY_ALLOWABLE_TOTALS };
}

function initEmployerVoluntaryTotals(): EmployeeMonthEmployerContributions {
  return { ...EMPTY_EMPLOYER_VOLUNTARY_TOTALS };
}

function expandAllowableSchedulesForMonth(params: {
  employeeId: string;
  month: PayrollMonth;
  schedules: AllowableScheduleLike[] | undefined;
}): EmployeeMonthDeductions {
  const { employeeId, month, schedules } = params;
  assertValidPayrollMonth(month);

  const totals = initAllowableTotals();

  for (const s of schedules ?? []) {
    if (s.frequency === 'once') {
      if (s.toMonth) {
        throw new Error(
          `Invalid allowable deduction schedule for ${employeeId}: "once" schedules must not have toMonth.`,
        );
      }
      if (s.fromMonth === month) totals[s.type] += s.amount;
      continue;
    }

    if (monthInRange({ month, fromMonth: s.fromMonth, toMonth: s.toMonth })) {
      totals[s.type] += s.amount;
    }
  }

  return totals;
}

function expandEmployerVoluntarySchedulesForMonth(params: {
  employeeId: string;
  month: PayrollMonth;
  schedules: EmployerVoluntaryScheduleLike[] | undefined;
}): EmployeeMonthEmployerContributions {
  const { employeeId, month, schedules } = params;
  assertValidPayrollMonth(month);

  const totals = initEmployerVoluntaryTotals();

  for (const s of schedules ?? []) {
    if (s.frequency === 'once') {
      if (s.toMonth) {
        throw new Error(
          `Invalid employer voluntary schedule for ${employeeId}: "once" schedules must not have toMonth.`,
        );
      }
      if (s.fromMonth === month) totals[s.type] += s.amount;
      continue;
    }

    if (monthInRange({ month, fromMonth: s.fromMonth, toMonth: s.toMonth })) {
      totals[s.type] += s.amount;
    }
  }

  return totals;
}

function expandAllowableSchedulesForMonthDetailed(params: {
  employeeId: string;
  month: PayrollMonth;
  schedules: AllowableScheduleLike[] | undefined;
}): {
  recurring: EmployeeMonthDeductions;
  once: EmployeeMonthDeductions;
} {
  const { employeeId, month, schedules } = params;
  assertValidPayrollMonth(month);

  const recurring = initAllowableTotals();
  const once = initAllowableTotals();

  for (const s of schedules ?? []) {
    if (s.frequency === 'once') {
      if (s.toMonth) {
        throw new Error(
          `Invalid allowable deduction schedule for ${employeeId}: "once" schedules must not have toMonth.`,
        );
      }
      if (s.fromMonth === month) once[s.type] += s.amount;
      continue;
    }

    if (monthInRange({ month, fromMonth: s.fromMonth, toMonth: s.toMonth })) {
      recurring[s.type] += s.amount;
    }
  }

  return { recurring, once };
}

function expandEmployerVoluntarySchedulesForMonthDetailed(params: {
  employeeId: string;
  month: PayrollMonth;
  schedules: EmployerVoluntaryScheduleLike[] | undefined;
}): {
  recurring: EmployeeMonthEmployerContributions;
  once: EmployeeMonthEmployerContributions;
} {
  const { employeeId, month, schedules } = params;
  assertValidPayrollMonth(month);

  const recurring = initEmployerVoluntaryTotals();
  const once = initEmployerVoluntaryTotals();

  for (const s of schedules ?? []) {
    if (s.frequency === 'once') {
      if (s.toMonth) {
        throw new Error(
          `Invalid employer voluntary schedule for ${employeeId}: "once" schedules must not have toMonth.`,
        );
      }
      if (s.fromMonth === month) once[s.type] += s.amount;
      continue;
    }

    if (monthInRange({ month, fromMonth: s.fromMonth, toMonth: s.toMonth })) {
      recurring[s.type] += s.amount;
    }
  }

  return { recurring, once };
}

/** Pick the single compensation record that applies to `month`. Throws on overlaps or missing record. */
export function getEmployeeCompensationForMonth(
  employee: Employee,
  month: PayrollMonth,
): CompensationRecord {
  const record = pickSinglePeriod(employee.compensation, month, 'compensation');
  if (!record) {
    throw new Error(
      `No compensation record found for employee ${employee.id} in ${month}.`,
    );
  }
  return record;
}

/** Pick the single statutory config record that applies to `month`. Throws on overlaps. */
export function getEmployeeStatutoryForMonth(
  employee: Employee,
  month: PayrollMonth,
): StatutoryConfigRecord | undefined {
  return pickSinglePeriod(employee.statutory, month, 'statutory');
}

/** Expand employee allowable deduction schedules into actual NGN amounts for `month`. */
export function getEmployeeDeductionsForMonth(
  employee: Employee,
  month: PayrollMonth,
): EmployeeMonthDeductions {
  return expandAllowableSchedulesForMonth({
    employeeId: employee.id,
    month,
    schedules: employee.allowableDeductions,
  });
}

/** Expand employer voluntary contribution schedules into actual NGN amounts for `month`. */
export function getEmployerContributionsForMonth(
  employee: Employee,
  month: PayrollMonth,
): EmployeeMonthEmployerContributions {
  return expandEmployerVoluntarySchedulesForMonth({
    employeeId: employee.id,
    month,
    schedules: employee.employerVoluntaryContributions,
  });
}

type EmployeeMonthDeductionsDetailed = {
  employeeRecurring: EmployeeMonthDeductions;
  employeeOnce: EmployeeMonthDeductions;
};

function getEmployeeDeductionsForMonthDetailed(
  employee: Employee,
  month: PayrollMonth,
): EmployeeMonthDeductionsDetailed {
  const { recurring, once } = expandAllowableSchedulesForMonthDetailed({
    employeeId: employee.id,
    month,
    schedules: employee.allowableDeductions,
  });

  return { employeeRecurring: recurring, employeeOnce: once };
}

type EmployeeMonthEmployerContributionsDetailed = {
  employerRecurring: EmployeeMonthEmployerContributions;
  employerOnce: EmployeeMonthEmployerContributions;
};

function getEmployerContributionsForMonthDetailed(
  employee: Employee,
  month: PayrollMonth,
): EmployeeMonthEmployerContributionsDetailed {
  const { recurring, once } = expandEmployerVoluntarySchedulesForMonthDetailed({
    employeeId: employee.id,
    month,
    schedules: employee.employerVoluntaryContributions,
  });

  return { employerRecurring: recurring, employerOnce: once };
}

function computeAnnualSplit(
  annualGross: number,
  breakdown?: CompensationBreakdown,
): {
  annualBasic: number;
  annualHousing: number;
  annualTransport: number;
  annualOtherAllowances: number;
} {
  if (!breakdown) {
    return {
      annualBasic: 0,
      annualHousing: 0,
      annualTransport: 0,
      annualOtherAllowances: annualGross,
    };
  }

  if (breakdown.breakdownType === 'percentage') {
    const annualBasic = annualGross * breakdown.basicValue;
    const annualHousing = annualGross * breakdown.housingValue;
    const annualTransport = annualGross * breakdown.transportValue;
    const used = annualBasic + annualHousing + annualTransport;
    return {
      annualBasic,
      annualHousing,
      annualTransport,
      annualOtherAllowances: Math.max(0, annualGross - used),
    };
  }

  const annualBasic = breakdown.basicValue;
  const annualHousing = breakdown.housingValue;
  const annualTransport = breakdown.transportValue;
  const used = annualBasic + annualHousing + annualTransport;
  return {
    annualBasic,
    annualHousing,
    annualTransport,
    annualOtherAllowances: Math.max(0, annualGross - used),
  };
}

/**
 * Resolve employee inputs for a single payroll month:
 * - selects the right compensation/statutory periods
 * - prorates amounts for join/exit mid-month
 * - computes basic/housing/transport splits and statutory contributions
 */
export function computeEmployeeMonthInputs(
  employee: Employee,
  month: PayrollMonth,
  defaults?: StatutoryDefaults,
  options?: { employmentProrationMethod?: EmploymentProrationMethod },
): EmployeeMonthInputs {
  const comp = getEmployeeCompensationForMonth(employee, month);
  const statutoryPeriod = getEmployeeStatutoryForMonth(employee, month);
  const hasPension =
    statutoryPeriod?.hasPension ?? defaults?.hasPension ?? false;
  const hasNHF = statutoryPeriod?.hasNHF ?? defaults?.hasNHF ?? false;
  const hasNHIS = statutoryPeriod?.hasNHIS ?? defaults?.hasNHIS ?? false;

  const annualGross = comp.annualGross;
  const annualRent = comp.annualRent ?? 0;

  const { annualBasic, annualHousing, annualTransport, annualOtherAllowances } =
    computeAnnualSplit(annualGross, comp.breakdown);

  const employmentFraction = getEmploymentFractionForMonth({
    employee,
    month,
    method: options?.employmentProrationMethod,
  });

  const monthlyGross = (annualGross / 12) * employmentFraction;
  const monthlyBasic = (annualBasic / 12) * employmentFraction;
  const monthlyHousing = (annualHousing / 12) * employmentFraction;
  const monthlyTransport = (annualTransport / 12) * employmentFraction;
  const monthlyOtherAllowances =
    (annualOtherAllowances / 12) * employmentFraction;

  const pensionBase = monthlyBasic + monthlyHousing + monthlyTransport;

  const { eeRate: eePensionRate, erRate: erPensionRate } = hasPension
    ? resolveRatePair({
        label: 'pension',
        override: statutoryPeriod?.pensionRates,
        defaults: defaults?.pensionRates,
        fallback: {
          employeeRate: MIN_EE_PENSION_RATE,
          employerRate: MIN_ER_PENSION_RATE,
        },
        minEmployerRate: MIN_ER_PENSION_RATE,
        minTotalRate: MIN_TOTAL_PENSION_RATE,
      })
    : { eeRate: 0, erRate: 0 };
  const eePension = hasPension ? pensionBase * eePensionRate : 0;
  const erPension = hasPension ? pensionBase * erPensionRate : 0;
  const eeNhf = hasNHF ? monthlyBasic * EE_NHF_RATE : 0;
  const { eeRate: eeNhisRate, erRate: erNhisRate } = hasNHIS
    ? resolveRatePair({
        label: 'NHIS',
        override: statutoryPeriod?.nhisRates,
        defaults: defaults?.nhisRates,
        fallback: {
          employeeRate: DEFAULT_EE_NHIS_RATE,
          employerRate: DEFAULT_ER_NHIS_RATE,
        },
        minEmployerRate: MIN_ER_NHIS_RATE,
        minTotalRate: MIN_TOTAL_NHIS_RATE,
      })
    : { eeRate: 0, erRate: 0 };
  const eeNhis = hasNHIS ? monthlyBasic * eeNhisRate : 0;
  const erNhis = hasNHIS ? monthlyBasic * erNhisRate : 0;
  // Note: NHF is treated as employee-only in this model (no statutory employer NHF).

  return {
    employeeId: employee.id,
    month,
    compensation: {
      month,
      annualGross,
      annualRent,
      annualBasic,
      annualHousing,
      annualTransport,
      annualOtherAllowances,
      monthlyGross,
      monthlyBasic,
      monthlyHousing,
      monthlyTransport,
      monthlyOtherAllowances,
      employmentFraction,
    },
    statutory: {
      hasPension,
      hasNHF,
      hasNHIS,
      eePension,
      erPension,
      eeNhf,
      eeNhis,
      erNhis,
    },
    deductions: getEmployeeDeductionsForMonth(employee, month),
    employerContributions: getEmployerContributionsForMonth(employee, month),
  };
}

const RENT_RELIEF_RATE = 0.2;
const RENT_RELIEF_CAP = 500_000;

function computeRentRelief(annualRentPaid: number): number {
  return Math.min(
    Math.max(0, annualRentPaid) * RENT_RELIEF_RATE,
    RENT_RELIEF_CAP,
  );
}

/** Compute annual tax using the configured `TAX_BANDS` on annual taxable income. */
export function computeAnnualTaxFromBands(annualTaxableIncome: number): number {
  const x = Math.max(0, annualTaxableIncome);
  let tax = 0;

  for (const band of TAX_BANDS) {
    if (x <= band.min) break;
    const upper = Math.min(x, band.max);
    const amountInBand = Math.max(0, upper - band.min);
    tax += amountInBand * band.rate;
  }

  return tax;
}

/**
 * Nigerian PAYE (cumulative/annualised method).
 *
 * For a given month:
 * - sums YTD actuals up to that month
 * - annualises YTD gross and recurring allowable deductions using months actually worked
 * - does NOT annualise one-off allowable deductions (they remain YTD totals)
 * - computes projected annual tax, converts to tax due YTD, and backs out this month PAYE
 */
export function computeNigeriaCumulativePayeForMonth(
  employee: Employee,
  month: PayrollMonth,
  defaults?: StatutoryDefaults,
  options?: { employmentProrationMethod?: EmploymentProrationMethod },
): NigeriaCumulativePayeMonthResult {
  const months = listMonthsFromJanuaryTo(month);
  const year = month.slice(0, 4);

  let grossYtd = 0;
  let employerPaidYtd = 0;
  let rentPaidYtd = 0;
  let allowableRecurringYtd = 0;
  let allowableOneOffYtd = 0;
  let workedMonthUnitsYtd = 0; // sum of employmentFraction across months (handles join/exit mid-month)

  let taxWithheldYtd = 0;

  let last: NigeriaCumulativePayeMonthResult | undefined;

  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    if (!m.startsWith(year)) {
      throw new Error(
        `Cross-year PAYE computation is not supported: ${m} vs ${year}.`,
      );
    }

    const monthNumber = i + 1;
    const employmentFraction = getEmploymentFractionForMonth({
      employee,
      month: m,
      method: options?.employmentProrationMethod,
    });
    if (employmentFraction > 0) workedMonthUnitsYtd += employmentFraction;

    if (employmentFraction > 0) {
      const inputs = computeEmployeeMonthInputs(employee, m, defaults, options);
      const d = getEmployeeDeductionsForMonthDetailed(employee, m);
      const c = getEmployerContributionsForMonthDetailed(employee, m);

      grossYtd += inputs.compensation.monthlyGross;
      rentPaidYtd += (inputs.compensation.annualRent / 12) * employmentFraction;

      // Employer-paid items reduce taxable base "before" allowable deductions.
      // (Per your rule: only employee-deducted amounts are allowables; employer-paid are removed earlier.)
      const employerPaidThisMonth =
        inputs.statutory.erPension +
        inputs.statutory.erNhis +
        c.employerRecurring.pension_voluntary * employmentFraction +
        c.employerOnce.pension_voluntary +
        c.employerRecurring.nhis_voluntary * employmentFraction +
        c.employerOnce.nhis_voluntary;

      employerPaidYtd += employerPaidThisMonth;

      // Allowable deductions:
      // - employee-paid recurring: statutory employee-side contributions + recurring schedules (prorated in partial months)
      // - one-off: schedules with frequency 'once' (do NOT annualise; not prorated)
      const allowableRecurringThisMonth =
        inputs.statutory.eePension +
        inputs.statutory.eeNhf +
        inputs.statutory.eeNhis +
        d.employeeRecurring.pension_additional * employmentFraction +
        d.employeeRecurring.nhis_additional * employmentFraction +
        d.employeeRecurring.owner_occupied_mortgage_interest *
          employmentFraction +
        d.employeeRecurring.life_insurance_premium * employmentFraction;

      const allowableOneOffThisMonth =
        d.employeeOnce.pension_additional +
        d.employeeOnce.nhis_additional +
        d.employeeOnce.owner_occupied_mortgage_interest +
        d.employeeOnce.life_insurance_premium;

      allowableRecurringYtd += allowableRecurringThisMonth;
      allowableOneOffYtd += allowableOneOffThisMonth;
    }

    // Cumulative PAYE annualisation should use months actually worked in the year (not always Jan..m),
    // otherwise employees who join mid-year get under-withheld in the early months.
    const denom = workedMonthUnitsYtd;
    const projectedAnnualGross = denom > 0 ? (grossYtd / denom) * 12 : 0;
    const projectedAnnualEmployerPaid =
      denom > 0 ? (employerPaidYtd / denom) * 12 : 0;
    const projectedAnnualGrossAfterEmployerPaid = Math.max(
      0,
      projectedAnnualGross - projectedAnnualEmployerPaid,
    );
    const projectedAnnualRentPaid = denom > 0 ? (rentPaidYtd / denom) * 12 : 0;
    const rentRelief = computeRentRelief(projectedAnnualRentPaid);
    const projectedAnnualAllowableRecurring =
      denom > 0 ? (allowableRecurringYtd / denom) * 12 : 0;
    const projectedAnnualAllowableTotal =
      projectedAnnualAllowableRecurring + allowableOneOffYtd;

    const projectedAnnualTaxableIncome = Math.max(
      0,
      projectedAnnualGrossAfterEmployerPaid -
        rentRelief -
        projectedAnnualAllowableTotal,
    );

    const projectedAnnualTax = computeAnnualTaxFromBands(
      projectedAnnualTaxableIncome,
    );
    const taxDueYtd = projectedAnnualTax * (workedMonthUnitsYtd / 12);

    const payeThisMonth = taxDueYtd - taxWithheldYtd;
    const taxWithheldYtdBeforeThisMonth = taxWithheldYtd;
    taxWithheldYtd += payeThisMonth;

    last = {
      month: m,
      monthNumber,
      grossYtd,
      projectedAnnualGross,
      employerPaidYtd,
      projectedAnnualEmployerPaid,
      projectedAnnualGrossAfterEmployerPaid,
      rentPaidYtd,
      projectedAnnualRentPaid,
      rentRelief,
      allowableRecurringYtd,
      allowableOneOffYtd,
      projectedAnnualAllowableRecurring,
      projectedAnnualAllowableTotal,
      projectedAnnualTaxableIncome,
      projectedAnnualTax,
      taxDueYtd,
      taxWithheldYtdBeforeThisMonth,
      payeThisMonth,
      taxWithheldYtdAfterThisMonth: taxWithheldYtd,
    };
  }

  if (!last) throw new Error(`Invalid month "${month}".`);
  return last;
}
