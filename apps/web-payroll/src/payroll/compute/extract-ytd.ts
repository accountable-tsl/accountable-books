import { loadRun, loadRunsIndex } from '../storage';
import { getPeriodStartKey } from '../utils';
import { getEmployeeIdentifier, matchEmployee } from './employee-matching';
import {
  calculateEmploymentFraction,
  resolveCompensationForMonth,
} from './payroll-utils';
import { resolveSettings } from './resolve-settings';

import type { PayrollRun, PayrollRunItem } from '../domain';

/**
 * YTD (Year-to-Date) Data Extraction Module
 *
 * This module extracts YTD data needed for PAYE computation:
 * - Loads finalized run history from prior months
 * - Calculates YTD totals (income, deductions, tax withheld)
 * - Extracts monthly actuals from historical runs
 * - Projects annual amounts from YTD data
 *
 * **Key Functions:**
 * - `loadFinalizedRunHistory()` - Loads relevant finalized runs for YTD
 * - `extractYtdData()` - Extracts YTD data needed for PAYE computation
 *
 * **Note:** This module does NOT compute PAYE. It only extracts and prepares YTD data.
 * The actual PAYE computation is handled by the unified `computePaye()` function in `compute-paye.ts`,
 * which is called from `compute-run.ts` with the extracted YTD data.
 */

/**
 * Load finalized run history for YTD calculations
 *
 * Returns finalized runs for the same company and tax year (Jan..current month),
 * sorted by month ascending. Only includes single-month runs (multi-period runs are excluded for YTD v1).
 *
 * **Tax Year Scope**: Nigerian tax year is January 1 - December 31 (calendar year).
 * This function ensures YTD calculations only include finalized runs from:
 * - The same tax year (periodYear === currentRun.periodYear)
 * - Months from January (month 1) up to and including the current month
 * - No runs from previous or future years are included
 *
 * @param currentRun - The current run being computed
 * @returns Array of finalized runs sorted by month (earliest first, Jan..current month)
 */
export async function loadFinalizedRunHistory(
  currentRun: PayrollRun,
): Promise<PayrollRun[]> {
  const runsIndex = await loadRunsIndex();
  const currentYear = currentRun.periodYear;
  const currentMonth = currentRun.periodMonth;

  // Validate: Tax year is calendar year (Jan-Dec)
  // We ensure this by only including runs where periodYear === currentYear
  // and periodMonth is between 1 (January) and currentMonth (inclusive)

  // Filter finalized runs for same company and year, up to current month
  const eligibleRuns: PayrollRun[] = [];

  for (const indexEntry of runsIndex.runs) {
    // Only finalized runs
    if (indexEntry.status !== 'final') continue;

    // Same company
    if (
      indexEntry.companyId !== currentRun.companyId &&
      !(indexEntry.companyId == null && currentRun.companyId == null)
    ) {
      continue;
    }

    // CRITICAL: Same tax year (ensures Jan-Dec scope, no cross-year contamination)
    // Nigerian tax year = calendar year (Jan 1 - Dec 31)
    if (indexEntry.periodYear !== currentYear) {
      continue; // Skip runs from different years
    }

    // Only runs from January (month 1) up to and including current month
    // This ensures we're building YTD from the start of the tax year
    if (indexEntry.periodMonth < 1 || indexEntry.periodMonth > currentMonth) {
      continue; // Skip months outside Jan..currentMonth range
    }

    // YTD v1: Only single-month runs (no periodEndMonth or equals periodMonth)
    if (
      indexEntry.periodEndMonth != null &&
      indexEntry.periodEndMonth !== indexEntry.periodMonth
    ) {
      // Multi-period run - skip for YTD v1
      continue;
    }

    // Load the full run
    const run = await loadRun(indexEntry.id);
    if (run) {
      eligibleRuns.push(run);
    }
  }

  // Sort by month (ascending) - all runs are same year, so just sort by month
  // This ensures we process months in order: Jan, Feb, Mar, ..., currentMonth
  eligibleRuns.sort((a, b) => {
    // Safety check: if years differ (shouldn't happen after filtering), sort by year first
    if (a.periodYear !== b.periodYear) {
      return a.periodYear - b.periodYear;
    }
    return a.periodMonth - b.periodMonth;
  });

  return eligibleRuns;
}

/**
 * Compute statutory deductions for a run item (for YTD calculations)
 *
 * **Computation Flow (Annual First, Then Convert to Monthly):**
 * 1. Compute annual deductions from annual BHT amounts
 * 2. Convert annual deductions to monthly (divide by 12)
 * 3. Apply employment fraction (prorate for partial months)
 *
 * This approach is consistent with PAYE computation: annualize → compute → convert.
 * We compute everything at the annual level first, then convert to monthly at the end.
 *
 * @param params - Parameters object
 * @param params.runItem - The payroll run item
 * @param params.run - The payroll run (for settings)
 * @param params.annualBasic - Annual basic salary
 * @param params.annualHousing - Annual housing allowance
 * @param params.annualTransport - Annual transport allowance
 * @param params.employmentFraction - Employment fraction for the month (0.0 to 1.0)
 * @returns Monthly statutory deductions (employee-paid only, already prorated by employment fraction)
 */
function computeStatutoryDeductionsForYtd(params: {
  runItem: PayrollRunItem;
  run: PayrollRun;
  annualBasic: number;
  annualHousing: number;
  annualTransport: number;
  employmentFraction: number;
}): {
  employeePension: number;
  employeeNhf: number;
  employeeNhis: number;
} {
  const {
    runItem,
    run,
    annualBasic,
    annualHousing,
    annualTransport,
    employmentFraction,
  } = params;

  // Resolve settings
  const settings = resolveSettings(runItem, run.settings);
  const pensionConfig = settings.pension;
  const nhfConfig = settings.nhf;
  const nhisConfig = settings.nhis;

  // Compute annual pension base: Basic + Housing + Transport
  const annualPensionBase = annualBasic + annualHousing + annualTransport;

  // Compute annual employee pension
  let annualEmployeePension = 0;
  if (pensionConfig.enabled !== false) {
    const eeRate = pensionConfig.employeeRate ?? 0.08; // 8%
    if (pensionConfig.employeeAmount != null) {
      // If fixed monthly amount specified, convert to annual
      const monthlyAmount = parseFloat(pensionConfig.employeeAmount);
      annualEmployeePension = monthlyAmount * 12;
    } else {
      annualEmployeePension = annualPensionBase * eeRate;
    }
  }
  const employeePension = (annualEmployeePension / 12) * employmentFraction;

  // NHF: 2.5% of Basic only (annual)
  let annualEmployeeNhf = 0;
  if (nhfConfig.enabled !== false) {
    const nhfRate = nhfConfig.employeeRate ?? 0.025; // 2.5%
    if (nhfConfig.employeeAmount != null) {
      const monthlyAmount = parseFloat(nhfConfig.employeeAmount);
      annualEmployeeNhf = monthlyAmount * 12;
    } else {
      annualEmployeeNhf = annualBasic * nhfRate;
    }
  }
  const employeeNhf = (annualEmployeeNhf / 12) * employmentFraction;

  // NHIS: employee 5% of Basic only (annual)
  let annualEmployeeNhis = 0;
  if (nhisConfig.enabled !== false) {
    const eeNhisRate = nhisConfig.employeeRate ?? 0.05; // 5%
    if (nhisConfig.employeeAmount != null) {
      const monthlyAmount = parseFloat(nhisConfig.employeeAmount);
      annualEmployeeNhis = monthlyAmount * 12;
    } else {
      annualEmployeeNhis = annualBasic * eeNhisRate;
    }
  }
  const employeeNhis = (annualEmployeeNhis / 12) * employmentFraction;

  return {
    employeePension,
    employeeNhf,
    employeeNhis,
  };
}

/**
 * Extract monthly taxable income and deductions from a run item
 *
 * This extracts the "actuals" for a single month from a PayrollRunItem.
 * Used to build YTD totals across multiple finalized runs.
 *
 * **Key improvements:**
 * - Resolves compensation period for the specific month (not just first item)
 * - Calculates employment fraction from join/exit dates (proration)
 *
 * @param runItem - The payroll run item
 * @param run - The payroll run (for settings and month)
 * @returns Monthly actuals for taxable income and deductions
 */
function extractMonthlyActuals(
  runItem: PayrollRunItem,
  run: PayrollRun,
): {
  monthlyGross: number;
  monthlyTaxableGross: number;
  monthlyAllowableDeductions: number; // Recurring + statutory (annualized)
  monthlyOneOffAllowableDeductions: number; // One-off (not annualized)
  monthlyPayeWithheld: number;
  employmentFraction: number;
  monthlyExemptIncome: number; // Exempt income (death/injury, redundancy, loss of employment up to cap)
  monthlyLossOfEmploymentAmount: number; // Total loss of employment amount (for YTD cap tracking)
  exemptIncomeBreakdown: {
    deathInjuryCompensation: number;
    redundancyPayment: number;
    lossOfEmploymentAmount: number;
  };
} {
  // Get month key for this run
  const monthKey = getPeriodStartKey(run);

  // Get compensation history
  const compHistory = runItem.payProfileSnapshot.compensationHistory;
  const emptyExemptBreakdown = {
    deathInjuryCompensation: 0,
    redundancyPayment: 0,
    lossOfEmploymentAmount: 0,
  };

  if (compHistory.length === 0) {
    return {
      monthlyGross: 0,
      monthlyTaxableGross: 0,
      monthlyAllowableDeductions: 0,
      monthlyOneOffAllowableDeductions: 0,
      monthlyPayeWithheld: 0,
      employmentFraction: 0,
      monthlyExemptIncome: 0,
      monthlyLossOfEmploymentAmount: 0,
      exemptIncomeBreakdown: emptyExemptBreakdown,
    };
  }

  // Resolve compensation period for this specific month
  const comp = resolveCompensationForMonth(compHistory, monthKey);
  if (!comp) {
    // No compensation period found for this month
    return {
      monthlyGross: 0,
      monthlyTaxableGross: 0,
      monthlyAllowableDeductions: 0,
      monthlyOneOffAllowableDeductions: 0,
      monthlyPayeWithheld: 0,
      employmentFraction: 0,
      monthlyExemptIncome: 0,
      monthlyLossOfEmploymentAmount: 0,
      exemptIncomeBreakdown: emptyExemptBreakdown,
    };
  }

  const annualGross = parseFloat(comp.annualGross);

  // Calculate employment fraction from join/exit dates
  // Use proration method from run settings (default: 'calendar_days')
  const prorationMethod =
    run.settings?.employmentProrationMethod ?? 'calendar_days';
  const employmentFraction = calculateEmploymentFraction(
    runItem,
    monthKey,
    prorationMethod,
  );

  // If not employed this month, return zeros
  if (employmentFraction === 0) {
    return {
      monthlyGross: 0,
      monthlyTaxableGross: 0,
      monthlyAllowableDeductions: 0,
      monthlyOneOffAllowableDeductions: 0,
      monthlyPayeWithheld: 0,
      employmentFraction: 0,
      monthlyExemptIncome: 0,
      monthlyLossOfEmploymentAmount: 0,
      exemptIncomeBreakdown: emptyExemptBreakdown,
    };
  }

  // Resolve all settings at once (more efficient than multiple calls)
  const settings = resolveSettings(runItem, run.settings);
  const breakdown = settings.bhtBreakdown;
  const basicRate = breakdown.basic ?? 1.0;
  const housingRate = breakdown.housing ?? 0;
  const transportRate = breakdown.transport ?? 0;

  // Compute annual split
  const annualBasic = annualGross * basicRate;
  const annualHousing = annualGross * housingRate;
  const annualTransport = annualGross * transportRate;

  // Compute statutory deductions from annual amounts first, then convert to monthly
  // This is consistent with PAYE computation: annualize → compute → convert
  const statutory = computeStatutoryDeductionsForYtd({
    runItem,
    run,
    annualBasic,
    annualHousing,
    annualTransport,
    employmentFraction,
  });

  // Convert to monthly (prorated by employment fraction)
  const monthlyGross = (annualGross / 12) * employmentFraction;

  const monthlyTaxableGross = monthlyGross;

  // One-off allowances - check for exempt income
  // Exempt income per Nigerian tax law:
  // - Death/injury compensation (fully exempt)
  // - Loss of employment compensation (exempt up to N50M per tax year)
  // - Redundancy payments (fully exempt, capital nature)
  let oneOffAllowances = 0;
  let exemptIncome = 0; // Income that should be excluded from taxable gross
  let lossOfEmploymentAmount = 0; // Total loss of employment amount this month (for YTD cap tracking)
  let deathInjuryCompensation = 0;
  let redundancyPayment = 0;

  if (runItem.edits?.oneOffAllowances) {
    for (const allowance of runItem.edits.oneOffAllowances) {
      const amount = parseFloat(allowance.amount);
      const taxTreatment = allowance.taxTreatment;

      if (taxTreatment === 'death_injury_compensation') {
        // Fully exempt
        exemptIncome += amount;
        deathInjuryCompensation += amount;
      } else if (taxTreatment === 'redundancy_payment') {
        // Fully exempt
        exemptIncome += amount;
        redundancyPayment += amount;
      } else if (taxTreatment === 'loss_of_employment_benefit') {
        // Track amount for YTD cap calculation (will be handled in extractYtdData)
        lossOfEmploymentAmount += amount;
        // Don't add to exemptIncome here - we'll calculate exemption in extractYtdData after checking YTD total
        // For now, treat as taxable (will be adjusted in extractYtdData)
        oneOffAllowances += amount;
      } else {
        // Taxable (default behavior)
        oneOffAllowances += amount;
      }
    }
  }

  // Total taxable gross = monthly gross + taxable one-off allowances (excludes exempt income)
  // Note: loss_of_employment_benefit will be adjusted in extractYtdData after YTD calculation
  const totalTaxableGross = monthlyTaxableGross + oneOffAllowances;

  // Allowable deductions = employee-paid statutory contributions
  // Plus voluntary contributions (recurring and one-off) that are marked as allowable
  let recurringAllowableDeductions = 0;
  let oneOffAllowableDeductions = 0;

  // Extract recurring deductions that are allowable
  // Allowable deductions per Nigerian tax law:
  // - Pension, NHF, NHIS (statutory + voluntary)
  // - Owner-occupied mortgage interest
  // - Life insurance premiums
  if (runItem.payProfileSnapshot.recurringDeductions) {
    for (const deduction of runItem.payProfileSnapshot.recurringDeductions) {
      // Check if deduction applies to this month
      const fromMonth = deduction.fromMonth;
      const toMonth = deduction.toMonth;
      if (monthKey >= fromMonth && (toMonth == null || monthKey <= toMonth)) {
        const taxTreatment = deduction.taxTreatment;
        if (
          taxTreatment === 'pension_voluntary' ||
          taxTreatment === 'nhf_voluntary' ||
          taxTreatment === 'nhis_voluntary' ||
          taxTreatment === 'owner_occupied_mortgage_interest' ||
          taxTreatment === 'life_insurance_premium'
        ) {
          // Recurring deductions are prorated by employment fraction
          recurringAllowableDeductions +=
            parseFloat(deduction.amount) * employmentFraction;
        }
      }
    }
  }

  // Extract one-off deductions that are allowable
  if (runItem.edits?.oneOffDeductions) {
    for (const deduction of runItem.edits.oneOffDeductions) {
      const taxTreatment = deduction.taxTreatment;
      if (
        taxTreatment === 'pension_voluntary' ||
        taxTreatment === 'nhf_voluntary' ||
        taxTreatment === 'nhis_voluntary' ||
        taxTreatment === 'owner_occupied_mortgage_interest' ||
        taxTreatment === 'life_insurance_premium'
      ) {
        // One-off deductions are NOT prorated (they're one-time)
        oneOffAllowableDeductions += parseFloat(deduction.amount);
      }
    }
  }

  // Statutory deductions (already prorated by employment fraction)
  const statutoryAllowableDeductions =
    statutory.employeePension + statutory.employeeNhf + statutory.employeeNhis;

  // Monthly allowable deductions (statutory + recurring, all prorated)
  // These will be annualized in extractYtdData
  const monthlyAllowableDeductions =
    statutoryAllowableDeductions + recurringAllowableDeductions;

  // One-off allowable deductions (NOT prorated, NOT annualized)
  // These are added directly to annual amount in extractYtdData

  // Get computed PAYE from finalized run if available
  let payeWithheld = 0;
  if (run.computed) {
    const computedItem = run.computed.items.find(
      (item) => item.runItemId === runItem.id,
    );
    if (computedItem?.paye) {
      payeWithheld = parseFloat(computedItem.paye);
    }
  }

  return {
    monthlyGross,
    monthlyTaxableGross: totalTaxableGross,
    monthlyAllowableDeductions,
    monthlyOneOffAllowableDeductions: oneOffAllowableDeductions,
    monthlyPayeWithheld: payeWithheld,
    employmentFraction,
    monthlyExemptIncome: exemptIncome,
    monthlyLossOfEmploymentAmount: lossOfEmploymentAmount,
    exemptIncomeBreakdown: {
      deathInjuryCompensation,
      redundancyPayment,
      lossOfEmploymentAmount,
    },
  };
}

/**
 * Calculate YTD totals for an employee from finalized run history
 *
 * @param currentRunItem - The employee's run item in the current run
 * @param finalizedRuns - Array of finalized runs (sorted by month)
 * @param currentRun - The current run (for settings)
 * @returns YTD totals for the employee
 */
function calculateEmployeeYtdTotals(
  currentRunItem: PayrollRunItem,
  finalizedRuns: PayrollRun[],
  currentRun: PayrollRun,
): {
  taxableGrossYtd: number;
  allowableDeductionsYtd: number; // Recurring + statutory (will be annualized)
  oneOffAllowableDeductionsYtd: number; // One-off (NOT annualized)
  taxWithheldYtdBefore: number;
  workedMonthUnitsYtd: number;
  exemptIncomeYtd: number; // Fully exempt income (death/injury, redundancy)
  lossOfEmploymentYtd: number; // Loss of employment benefits YTD (for cap calculation)
  exemptIncomeBreakdownYtd: {
    deathInjuryCompensation: number;
    redundancyPayment: number;
    lossOfEmployment: number;
  };
} {
  const employeeId = getEmployeeIdentifier(currentRunItem);

  let taxableGrossYtd = 0;
  let allowableDeductionsYtd = 0;
  let oneOffAllowableDeductionsYtd = 0;
  let taxWithheldYtdBefore = 0;
  let workedMonthUnitsYtd = 0;
  let exemptIncomeYtd = 0;
  let lossOfEmploymentYtd = 0;
  const exemptIncomeBreakdownYtd = {
    deathInjuryCompensation: 0,
    redundancyPayment: 0,
    lossOfEmployment: 0,
  };

  // Sum up totals from prior finalized runs (excluding current month)
  for (const finalizedRun of finalizedRuns) {
    // Skip current month (we'll add it separately)
    if (
      finalizedRun.periodYear === currentRun.periodYear &&
      finalizedRun.periodMonth === currentRun.periodMonth
    ) {
      continue;
    }

    // Find matching employee in this run
    const matchingItem = finalizedRun.items.find((item) =>
      matchEmployee(employeeId.refId, employeeId.taxId, item),
    );

    if (matchingItem) {
      const actuals = extractMonthlyActuals(matchingItem, finalizedRun);
      taxableGrossYtd += actuals.monthlyTaxableGross;
      allowableDeductionsYtd += actuals.monthlyAllowableDeductions;
      oneOffAllowableDeductionsYtd += actuals.monthlyOneOffAllowableDeductions;
      taxWithheldYtdBefore += actuals.monthlyPayeWithheld;
      workedMonthUnitsYtd += actuals.employmentFraction;
      exemptIncomeYtd += actuals.monthlyExemptIncome;
      lossOfEmploymentYtd += actuals.monthlyLossOfEmploymentAmount;
      exemptIncomeBreakdownYtd.deathInjuryCompensation +=
        actuals.exemptIncomeBreakdown.deathInjuryCompensation;
      exemptIncomeBreakdownYtd.redundancyPayment +=
        actuals.exemptIncomeBreakdown.redundancyPayment;
      exemptIncomeBreakdownYtd.lossOfEmployment +=
        actuals.exemptIncomeBreakdown.lossOfEmploymentAmount;
    }
  }

  return {
    taxableGrossYtd,
    allowableDeductionsYtd,
    oneOffAllowableDeductionsYtd,
    taxWithheldYtdBefore,
    workedMonthUnitsYtd,
    exemptIncomeYtd,
    lossOfEmploymentYtd,
    exemptIncomeBreakdownYtd,
  };
}

/**
 * Extract YTD data for PAYE computation
 *
 * This function extracts and calculates the YTD amounts needed for PAYE computation.
 *
 * **Tax Year Scope**: Only includes finalized runs from the same calendar year (Jan-Dec).
 * Runs from previous or future years are excluded by loadFinalizedRunHistory().
 *
 * **Why YTD?**: Nigerian PAYE is cumulative. If someone earns 500k Jan-Mar and 800k in April,
 * their PAYE for April isn't just based on April's income. Instead, we:
 * - Sum all income from Jan-Apr: 2.3M
 * - Average monthly: 575k
 * - Project annual: 6.9M
 * - Pass to unified computePaye function which handles the tax computation
 *
 * **Deductions Handling**:
 * - Recurring deductions (statutory + voluntary recurring) are annualized: (YTD / months) × 12
 * - One-off deductions (voluntary one-time contributions) are NOT annualized: added directly to annual amount
 *
 * @param currentRunItem - The employee's run item in the current run
 * @param currentRun - The current run (must be in the tax year being computed)
 * @param finalizedRuns - Array of finalized runs (from loadFinalizedRunHistory, already filtered to same tax year)
 * @returns YTD data for PAYE computation, or undefined if YTD cannot be computed
 */
export function extractYtdData(
  currentRunItem: PayrollRunItem,
  currentRun: PayrollRun,
  finalizedRuns: PayrollRun[],
):
  | {
      projectedAnnualGross: number;
      projectedAnnualAllowableDeductions: number;
      workedMonthUnits: number;
      taxWithheldYtd: number;
      // Exempt income details for tax breakdown
      exemptIncome: {
        deathInjuryCompensation: number;
        redundancyPayment: number;
        lossOfEmployment: {
          total: number;
          exempt: number;
          taxable: number;
        };
      };
    }
  | undefined {
  // Check if employee can be matched (must have refId or taxId)
  const employeeId = getEmployeeIdentifier(currentRunItem);
  if (!employeeId.refId && !employeeId.taxId) {
    // Cannot match employee - cannot compute YTD
    return undefined;
  }

  // Calculate YTD totals from prior finalized runs
  const ytdTotals = calculateEmployeeYtdTotals(
    currentRunItem,
    finalizedRuns,
    currentRun,
  );

  // Extract current month actuals
  const currentMonthActuals = extractMonthlyActuals(currentRunItem, currentRun);

  // Handle exempt income and loss of employment cap
  const LOSS_OF_EMPLOYMENT_CAP = 50_000_000; // N50M cap per tax year
  const totalLossOfEmploymentYtd =
    ytdTotals.lossOfEmploymentYtd +
    currentMonthActuals.monthlyLossOfEmploymentAmount;

  // Calculate exempt portion of loss of employment (up to N50M cap)
  const exemptLossOfEmploymentYtd = Math.min(
    totalLossOfEmploymentYtd,
    LOSS_OF_EMPLOYMENT_CAP,
  );
  const exemptLossOfEmploymentThisMonth = Math.min(
    currentMonthActuals.monthlyLossOfEmploymentAmount,
    Math.max(0, LOSS_OF_EMPLOYMENT_CAP - ytdTotals.lossOfEmploymentYtd),
  );

  // Build total YTD taxable gross (excluding exempt income)
  // Note: currentMonthActuals.monthlyTaxableGross includes loss_of_employment_benefit as taxable
  // We need to adjust it by removing the exempt portion
  const adjustedCurrentMonthTaxableGross =
    currentMonthActuals.monthlyTaxableGross - exemptLossOfEmploymentThisMonth;

  const totalTaxableGrossYtd =
    ytdTotals.taxableGrossYtd + adjustedCurrentMonthTaxableGross;

  const totalAllowableDeductionsYtd =
    ytdTotals.allowableDeductionsYtd +
    currentMonthActuals.monthlyAllowableDeductions;
  // One-off deductions are NOT annualized - sum them directly
  const totalOneOffAllowableDeductionsYtd =
    ytdTotals.oneOffAllowableDeductionsYtd +
    currentMonthActuals.monthlyOneOffAllowableDeductions;
  const totalWorkedMonthUnitsYtd =
    ytdTotals.workedMonthUnitsYtd + currentMonthActuals.employmentFraction;

  // If no months worked, cannot compute
  if (totalWorkedMonthUnitsYtd === 0) {
    return undefined;
  }

  // Annualize recurring amounts (gross income and recurring deductions)
  const projectedAnnualGross =
    (totalTaxableGrossYtd / totalWorkedMonthUnitsYtd) * 12;
  const projectedAnnualAllowableDeductions =
    (totalAllowableDeductionsYtd / totalWorkedMonthUnitsYtd) * 12 +
    totalOneOffAllowableDeductionsYtd; // Add one-off deductions directly (not annualized)

  // Build exempt income breakdown (YTD totals + current month)
  const totalExemptIncomeBreakdown = {
    deathInjuryCompensation:
      ytdTotals.exemptIncomeBreakdownYtd.deathInjuryCompensation +
      currentMonthActuals.exemptIncomeBreakdown.deathInjuryCompensation,
    redundancyPayment:
      ytdTotals.exemptIncomeBreakdownYtd.redundancyPayment +
      currentMonthActuals.exemptIncomeBreakdown.redundancyPayment,
    lossOfEmployment: {
      total: totalLossOfEmploymentYtd,
      exempt: exemptLossOfEmploymentYtd,
      taxable: totalLossOfEmploymentYtd - exemptLossOfEmploymentYtd,
    },
  };

  return {
    projectedAnnualGross,
    projectedAnnualAllowableDeductions,
    workedMonthUnits: totalWorkedMonthUnitsYtd,
    taxWithheldYtd: ytdTotals.taxWithheldYtdBefore,
    exemptIncome: totalExemptIncomeBreakdown,
  };
}
