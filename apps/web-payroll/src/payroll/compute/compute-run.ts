import { getCurrentTimestamp, getPeriodStartKey } from '../utils';
import { logger } from '../utils/logger';
import { COMPANY_DEFAULTS } from '../data/company-defaults';

import { resolveSettings } from './resolve-settings';
import {
  getCompensationAndFraction,
} from './payroll-utils';
import {
  computePaye,
  type ComputePayeResult,
} from './compute-paye';
import { loadFinalizedRunHistory, extractYtdData } from './extract-ytd';

import type {
  PayrollComputedRun,
  PayrollRun,
  PayrollRunItem,
} from '../domain';
import { PayrollComputedItemSchema } from '../domain';
import type { z } from 'zod';

type PayrollComputedItem = z.infer<typeof PayrollComputedItemSchema>;

/**
 * Count the number of months in a period (fromMonth to toMonth, inclusive)
 *
 * @param fromMonth - Start month (YYYY-MM)
 * @param toMonth - End month (YYYY-MM) or undefined for open-ended
 * @returns Number of months in the period
 */
function countMonthsInPeriod(fromMonth: string, toMonth: string | undefined): number {
  const [startYear, startMonth] = fromMonth.split('-').map(Number);
  const endMonth = toMonth ?? `${startYear + 100}-12`; // Default to far future for open-ended
  const [endYear, endMonthNum] = endMonth.split('-').map(Number);

  // Calculate total months
  const totalMonths = (endYear - startYear) * 12 + (endMonthNum - startMonth) + 1;
  return totalMonths;
}

/**
 * Calculate annual rent from rent history for a tax year
 *
 * **Calculation Method**:
 * 1. For each rent period, calculate monthly rent = period rent / number of months in period
 * 2. For each month in the tax year (Jan-Dec), find which period applies
 * 3. If no period applies, use the last known monthly rent (extrapolation)
 * 4. Add monthly rent to the total
 * 5. This gives us the total annual rent for the tax year
 *
 * **Extrapolation**: If rent data ends before the tax year ends, we use the last known
 * monthly rent amount for remaining months. This assumes rent continues at the same rate.
 *
 * **Example Scenario**:
 * - Period 1: Sept 2025 to Mar 2026, rent = 700,000 (7 months)
 *   - Monthly rent = 700,000 / 7 = 100,000/month
 *   - For 2026: Jan-Mar = 3 months × 100,000 = 300,000
 *   - Apr-Dec: No period, use last known (100,000/month) = 9 months × 100,000 = 900,000
 *   - Total for 2026: 300,000 + 900,000 = 1,200,000 (with extrapolation)
 *
 * **Tax Year**: Nigerian tax year is January 1 - December 31 (calendar year).
 *
 * @param rentHistory - Array of rent periods
 * @param taxYear - The tax year (e.g., 2026)
 * @returns Object with total annual rent and flag indicating if extrapolation was used
 */
function calculateAnnualRent(
  rentHistory: Array<{ fromMonth: string; toMonth?: string; rent: string }> | undefined,
  taxYear: number,
): { annualRent: number; usedExtrapolation: boolean } {
  if (!rentHistory || rentHistory.length === 0) {
    return { annualRent: 0, usedExtrapolation: false };
  }

  let totalAnnualRent = 0;
  let usedExtrapolation = false;
  let lastKnownMonthlyRent = 0;

  // For each month in the tax year, find the applicable rent period and add monthly rent
  for (let month = 1; month <= 12; month++) {
    const monthKey = `${taxYear}-${String(month).padStart(2, '0')}`;
    let foundPeriod = false;

    for (const rentPeriod of rentHistory) {
      const periodStart = rentPeriod.fromMonth;
      const periodEnd = rentPeriod.toMonth ?? '9999-12';

      if (monthKey >= periodStart && monthKey <= periodEnd) {
        const periodRent = parseFloat(rentPeriod.rent);
        if (!isNaN(periodRent) && periodRent > 0) {
          const monthsInPeriod = countMonthsInPeriod(periodStart, rentPeriod.toMonth);
          const monthlyRent = periodRent / monthsInPeriod;
          
          lastKnownMonthlyRent = monthlyRent;
          totalAnnualRent += monthlyRent;
          foundPeriod = true;
        }
        break;
      }
    }
    if (!foundPeriod && lastKnownMonthlyRent > 0) {
      totalAnnualRent += lastKnownMonthlyRent;
      usedExtrapolation = true;
    }
  }

  return { annualRent: totalAnnualRent, usedExtrapolation };
}

/**
 * Compute annual BHT split from compensation period.
 *
 * **Priority:**
 * 1. If compensation has explicit non-zero annualBasic, annualHousing, annualTransport → use those directly
 * 2. Otherwise, use resolved breakdown rates to compute from annualGross
 * 3. Default to 100% basic if no breakdown exists
 *
 * @param params - Parameters object
 * @param params.compensation - Compensation period (may have explicit BHT values)
 * @param params.annualGross - Annual gross amount
 * @param params.breakdownRates - Resolved breakdown rates (from resolveSettings)
 * @returns Annual BHT split
 */
function computeAnnualBhtSplit(params: {
  compensation: {
    annualBasic?: string;
    annualHousing?: string;
    annualTransport?: string;
  };
  annualGross: number;
  breakdownRates: { basic?: number; housing?: number; transport?: number };
}): {
  annualBasic: number;
  annualHousing: number;
  annualTransport: number;
  annualOtherAllowances: number;
} {
  const { compensation, annualGross, breakdownRates } = params;

  // Priority 1: Check if compensation has explicit BHT values
  if (
    compensation.annualBasic != null ||
    compensation.annualHousing != null ||
    compensation.annualTransport != null
  ) {
    const annualBasic = compensation.annualBasic
      ? moneyToNumber(compensation.annualBasic)
      : 0;
    const annualHousing = compensation.annualHousing
      ? moneyToNumber(compensation.annualHousing)
      : 0;
    const annualTransport = compensation.annualTransport
      ? moneyToNumber(compensation.annualTransport)
      : 0;

    const used = annualBasic + annualHousing + annualTransport;

    if (used > 0) {
      return {
        annualBasic,
        annualHousing,
        annualTransport,
        annualOtherAllowances: Math.max(0, annualGross - used),
      };
    }
  }

  let basicRate: number;
  let housingRate: number;
  let transportRate: number;
  
  if (!breakdownRates) {
    basicRate = 1.0;
    housingRate = 0;
    transportRate = 0;
  } else {
    basicRate = breakdownRates.basic != null ? breakdownRates.basic : 1.0;
    housingRate = breakdownRates.housing != null ? breakdownRates.housing : 0;
    transportRate = breakdownRates.transport != null ? breakdownRates.transport : 0;
    
    const totalRate = basicRate + housingRate + transportRate;
    if (totalRate === 0) {
      basicRate = 1.0;
      housingRate = 0;
      transportRate = 0;
    }
  }
  
  const finalBasicRate = basicRate;
  const finalHousingRate = housingRate;
  const finalTransportRate = transportRate;

  const annualBasic = annualGross * finalBasicRate;
  const annualHousing = annualGross * finalHousingRate;
  const annualTransport = annualGross * finalTransportRate;
  const used = annualBasic + annualHousing + annualTransport;

  return {
    annualBasic,
    annualHousing,
    annualTransport,
    annualOtherAllowances: Math.max(0, annualGross - used),
  };
}

/**
 * Convert money string to number
 */
function moneyToNumber(money: string): number {
  return parseFloat(money);
}

/**
 * Convert number to money string (decimal string)
 */
function numberToMoney(value: number): string {
  return value.toFixed(2);
}

/**
 * Compute statutory deductions for a single run item.
 * Uses resolved settings with precedence: employee > company > system
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
 * @returns Monthly statutory deductions (already prorated by employment fraction)
 */
function computeStatutoryDeductions(params: {
  runItem: PayrollRunItem;
  run: PayrollRun;
  annualBasic: number;
  annualHousing: number;
  annualTransport: number;
  employmentFraction: number;
}): {
  // Monthly amounts already prorated by employment fraction
  employeePension: number;
  employerPension: number;
  employeeNhf: number;
  employeeNhis: number;
  employerNhis: number;
} {
  const {
    runItem,
    run,
    annualBasic,
    annualHousing,
    annualTransport,
    employmentFraction,
  } = params;

  // Resolve all settings at once (more efficient)
  const settings = resolveSettings(runItem, run.settings);
  const pensionConfig = settings.pension;
  const nhfConfig = settings.nhf;
  const nhisConfig = settings.nhis;

  // Compute annual pension base: Basic + Housing + Transport
  const annualPensionBase = annualBasic + annualHousing + annualTransport;

  // Compute annual pension amounts
  let annualEmployeePension = 0;
  let annualEmployerPension = 0;
  if (pensionConfig.enabled !== false) {
    // Default rates if not specified
    const eeRate = pensionConfig.employeeRate ?? 0.08; // 8%
    const erRate = pensionConfig.employerRate ?? 0.1; // 10%

    if (pensionConfig.employeeAmount != null) {
      const monthlyAmount = moneyToNumber(pensionConfig.employeeAmount);
      annualEmployeePension = monthlyAmount * 12;
    } else {
      annualEmployeePension = annualPensionBase * eeRate;
    }

    if (pensionConfig.employerAmount != null) {
      const monthlyAmount = moneyToNumber(pensionConfig.employerAmount);
      annualEmployerPension = monthlyAmount * 12;
    } else {
      annualEmployerPension = annualPensionBase * erRate;
    }
  }

  // Convert annual to monthly (prorated)
  const employeePension = (annualEmployeePension / 12) * employmentFraction;
  const employerPension = (annualEmployerPension / 12) * employmentFraction;

  // NHF: 2.5% of Basic only (annual)
  let annualEmployeeNhf = 0;
  if (nhfConfig.enabled !== false) {
    const nhfRate = nhfConfig.employeeRate ?? 0.025; // 2.5%
    if (nhfConfig.employeeAmount != null) {
      const monthlyAmount = moneyToNumber(nhfConfig.employeeAmount);
      annualEmployeeNhf = monthlyAmount * 12;
    } else {
      annualEmployeeNhf = annualBasic * nhfRate;
    }
  }
  const employeeNhf = (annualEmployeeNhf / 12) * employmentFraction;

  // NHIS: employee 5%, employer 10% of Basic only (annual)
  let annualEmployeeNhis = 0;
  let annualEmployerNhis = 0;
  if (nhisConfig.enabled !== false) {
    const eeNhisRate = nhisConfig.employeeRate ?? 0.05; // 5%
    const erNhisRate = nhisConfig.employerRate ?? 0.1; // 10%

    if (nhisConfig.employeeAmount != null) {
      const monthlyAmount = moneyToNumber(nhisConfig.employeeAmount);
      annualEmployeeNhis = monthlyAmount * 12;
    } else {
      annualEmployeeNhis = annualBasic * eeNhisRate;
    }

    if (nhisConfig.employerAmount != null) {
      const monthlyAmount = moneyToNumber(nhisConfig.employerAmount);
      annualEmployerNhis = monthlyAmount * 12;
    } else {
      annualEmployerNhis = annualBasic * erNhisRate;
    }
  }
  const employeeNhis = (annualEmployeeNhis / 12) * employmentFraction;
  const employerNhis = (annualEmployerNhis / 12) * employmentFraction;

  return {
    employeePension,
    employerPension,
    employeeNhf,
    employeeNhis,
    employerNhis,
  };
}

/**
 * Compute a single run item (employee) for the payroll run.
 *
 * This function:
 * 1. Resolves compensation period for the month (not just first item)
 * 2. Calculates employment fraction from join/exit dates (proration)
 * 3. Computes monthly amounts (prorated)
 * 4. Computes PAYE using unified computation (YTD or non-YTD)
 */
async function computeRunItem(
  runItem: PayrollRunItem,
  run: PayrollRun,
  monthKey: string,
): Promise<PayrollComputedItem> {
  // Get compensation and employment fraction using shared utilities
  const compAndFraction = getCompensationAndFraction(runItem, run);
  if (!compAndFraction) {
    throw new Error(
      `No compensation found for employee ${runItem.employeeSnapshot.fullName} for period ${monthKey}`,
    );
  }

  const { comp, employmentFraction } = compAndFraction;
  const annualGross = moneyToNumber(comp.annualGross);

  if (employmentFraction === 0) {
    throw new Error(
      `Employee ${runItem.employeeSnapshot.fullName} was not employed in period ${monthKey} (joinDate: ${runItem.employeeSnapshot.joinDate})`,
    );
  }

  const settings = resolveSettings(runItem, run.settings);

  if (!settings.bhtBreakdown || (!settings.bhtBreakdown.basic && !settings.bhtBreakdown.housing && !settings.bhtBreakdown.transport)) {
    logger.warn('BHT breakdown is empty or invalid', {
      employeeName: runItem.employeeSnapshot.fullName,
      breakdown: settings.bhtBreakdown,
      runSettings: run.settings?.bhtBreakdown,
    });
  }

  const breakdownRates = settings.bhtBreakdown;
  
  if (!breakdownRates || (breakdownRates.basic == null && breakdownRates.housing == null && breakdownRates.transport == null)) {
    logger.error('BHT breakdown rates are missing or empty', {
      employeeName: runItem.employeeSnapshot.fullName,
      breakdownRates,
      runSettings: run.settings?.bhtBreakdown,
      systemDefaults: COMPANY_DEFAULTS.settings?.bhtBreakdown,
    });
    const fallbackBreakdown = { basic: 1.0 };
    var { annualBasic, annualHousing, annualTransport } = computeAnnualBhtSplit({
      compensation: {
        annualBasic: comp.annualBasic,
        annualHousing: comp.annualHousing,
        annualTransport: comp.annualTransport,
      },
      annualGross,
      breakdownRates: fallbackBreakdown,
    });
  } else {
    var { annualBasic, annualHousing, annualTransport } = computeAnnualBhtSplit({
      compensation: {
        annualBasic: comp.annualBasic,
        annualHousing: comp.annualHousing,
        annualTransport: comp.annualTransport,
      },
      annualGross,
      breakdownRates,
    });
  }
  
  if (annualGross > 0 && annualBasic === 0 && annualHousing === 0 && annualTransport === 0) {
    logger.error('BHT computation resulted in all zeros', {
      employeeName: runItem.employeeSnapshot.fullName,
      annualGross,
      annualBasic,
      annualHousing,
      annualTransport,
      breakdownRates,
      settingsBhtBreakdown: settings.bhtBreakdown,
      runSettingsBhtBreakdown: run.settings?.bhtBreakdown,
      compensation: {
        annualBasic: comp.annualBasic,
        annualHousing: comp.annualHousing,
        annualTransport: comp.annualTransport,
      },
    });
    annualBasic = annualGross;
    annualHousing = 0;
    annualTransport = 0;
  }

  // Compute monthly statutory deductions
  const statutory = computeStatutoryDeductions({
    runItem,
    run,
    annualBasic,
    annualHousing,
    annualTransport,
    employmentFraction,
  });

  // Convert to monthly (prorated by employment fraction)
  const monthlyGross = (annualGross / 12) * employmentFraction;
  const monthlyBasic = (annualBasic / 12) * employmentFraction;
  const monthlyHousing = (annualHousing / 12) * employmentFraction;
  const monthlyTransport = (annualTransport / 12) * employmentFraction;

  // Compute one-off allowances and deductions from edits
  // Handle exempt income: death/injury compensation, redundancy payments, loss of employment (up to N50M)
  let oneOffAllowancesTotal = 0;
  let exemptIncomeTotal = 0;
  let lossOfEmploymentAmount = 0;
  let oneOffDeductionsTotal = 0;
  let oneOffEmployerContributionsTotal = 0;
  const LOSS_OF_EMPLOYMENT_CAP = 50_000_000; // N50M cap per tax year

  // Track exempt income breakdown
  let deathInjuryCompensation = 0;
  let redundancyPayment = 0;
  let lossOfEmploymentTotal = 0;
  let lossOfEmploymentExempt = 0;
  let lossOfEmploymentTaxable = 0;

  if (runItem.edits) {
    if (runItem.edits.oneOffAllowances) {
      for (const allowance of runItem.edits.oneOffAllowances) {
        const amount = moneyToNumber(allowance.amount);
        const taxTreatment = allowance.taxTreatment;

        if (taxTreatment === 'death_injury_compensation') {
          // Fully exempt
          exemptIncomeTotal += amount;
          deathInjuryCompensation += amount;
        } else if (taxTreatment === 'redundancy_payment') {
          // Fully exempt
          exemptIncomeTotal += amount;
          redundancyPayment += amount;
        } else if (taxTreatment === 'loss_of_employment_benefit') {
          lossOfEmploymentAmount += amount;
          lossOfEmploymentTotal += amount;
          const exemptAmount = Math.min(amount, LOSS_OF_EMPLOYMENT_CAP);
          exemptIncomeTotal += exemptAmount;
          lossOfEmploymentExempt += exemptAmount;
          const taxableAmount = Math.max(0, amount - exemptAmount);
          oneOffAllowancesTotal += taxableAmount;
          lossOfEmploymentTaxable += taxableAmount;
        } else {
          // Taxable (default)
          oneOffAllowancesTotal += amount;
        }
      }
    }
    if (runItem.edits.oneOffDeductions) {
      oneOffDeductionsTotal = runItem.edits.oneOffDeductions.reduce(
        (sum, item) => sum + moneyToNumber(item.amount),
        0,
      );
    }
    if (runItem.edits.oneOffEmployerContributions) {
      oneOffEmployerContributionsTotal = runItem.edits.oneOffEmployerContributions.reduce(
        (sum, item) => sum + moneyToNumber(item.amount),
        0,
      );
    }
  }

  // Compute recurring deductions from payProfileSnapshot
  let recurringDeductionsTotal = 0;
  if (runItem.payProfileSnapshot.recurringDeductions && runItem.payProfileSnapshot.recurringDeductions.length > 0) {
    recurringDeductionsTotal = runItem.payProfileSnapshot.recurringDeductions.reduce(
      (sum, deduction) => {
        const fromMonth = deduction.fromMonth;
        const toMonth = deduction.toMonth;
        if (
          monthKey >= fromMonth &&
          (toMonth == null || monthKey <= toMonth)
        ) {
          return sum + moneyToNumber(deduction.amount);
        }
        return sum;
      },
      0,
    );
  }

  const totalDeductions =
    statutory.employeePension +
    statutory.employeeNhf +
    statutory.employeeNhis +
    recurringDeductionsTotal +
    oneOffDeductionsTotal;

  const employerCost =
    monthlyGross +
    statutory.employerPension +
    statutory.employerNhis +
    oneOffAllowancesTotal +
    oneOffEmployerContributionsTotal;

  const enableRentRelief = run.settings?.enableRentRelief !== false;
  const rentCalculation = enableRentRelief
    ? calculateAnnualRent(runItem.payProfileSnapshot.rentHistory, run.periodYear)
    : { annualRent: 0, usedExtrapolation: false };
  const annualRent = rentCalculation.annualRent;

  const enableYtd = run.settings?.enableYtd !== false;

  let payeResult: ComputePayeResult | undefined;
  let ytdData: ReturnType<typeof extractYtdData> | undefined;
  let finalizedRunsForYtd: Awaited<ReturnType<typeof loadFinalizedRunHistory>> | undefined;

  if (enableYtd) {
    try {
      finalizedRunsForYtd = await loadFinalizedRunHistory(run);
      ytdData = extractYtdData(runItem, run, finalizedRunsForYtd);

      if (ytdData) {
        payeResult = computePaye({
          annualTaxableGross: ytdData.projectedAnnualGross,
          annualAllowableDeductions: ytdData.projectedAnnualAllowableDeductions,
          annualRent,
          enableYtd: true,
          enableRentRelief,
          workedMonthUnits: ytdData.workedMonthUnits,
          taxWithheldYtd: ytdData.taxWithheldYtd,
        });
      }
    } catch (error) {
      logger.warn('YTD PAYE computation failed, falling back to non-YTD', {
        employeeName: runItem.employeeSnapshot.fullName,
        error,
      });
    }
  }

  const allowableDeductionsBreakdown = {
    statutory: {
      pension: statutory.employeePension,
      nhf: statutory.employeeNhf,
      nhis: statutory.employeeNhis,
    },
    voluntaryRecurring: {
      pension: 0,
      nhf: 0,
      nhis: 0,
      ownerOccupiedMortgageInterest: 0,
      lifeInsurancePremium: 0,
    },
    voluntaryOneOff: {
      pension: 0,
      nhf: 0,
      nhis: 0,
      ownerOccupiedMortgageInterest: 0,
      lifeInsurancePremium: 0,
    },
  };

  if (runItem.payProfileSnapshot.recurringDeductions) {
    for (const deduction of runItem.payProfileSnapshot.recurringDeductions) {
      const fromMonth = deduction.fromMonth;
      const toMonth = deduction.toMonth;
      if (
        monthKey >= fromMonth &&
        (toMonth == null || monthKey <= toMonth)
      ) {
        const taxTreatment = deduction.taxTreatment;
        const amount = moneyToNumber(deduction.amount) * employmentFraction;
        
        if (taxTreatment === 'pension_voluntary') {
          allowableDeductionsBreakdown.voluntaryRecurring.pension += amount;
        } else if (taxTreatment === 'nhf_voluntary') {
          allowableDeductionsBreakdown.voluntaryRecurring.nhf += amount;
        } else if (taxTreatment === 'nhis_voluntary') {
          allowableDeductionsBreakdown.voluntaryRecurring.nhis += amount;
        } else if (taxTreatment === 'owner_occupied_mortgage_interest') {
          allowableDeductionsBreakdown.voluntaryRecurring.ownerOccupiedMortgageInterest += amount;
        } else if (taxTreatment === 'life_insurance_premium') {
          allowableDeductionsBreakdown.voluntaryRecurring.lifeInsurancePremium += amount;
        }
      }
    }
  }

  if (runItem.edits?.oneOffDeductions) {
    for (const deduction of runItem.edits.oneOffDeductions) {
      const taxTreatment = deduction.taxTreatment;
      const amount = moneyToNumber(deduction.amount);
      
      if (taxTreatment === 'pension_voluntary') {
        allowableDeductionsBreakdown.voluntaryOneOff.pension += amount;
      } else if (taxTreatment === 'nhf_voluntary') {
        allowableDeductionsBreakdown.voluntaryOneOff.nhf += amount;
      } else if (taxTreatment === 'nhis_voluntary') {
        allowableDeductionsBreakdown.voluntaryOneOff.nhis += amount;
      } else if (taxTreatment === 'owner_occupied_mortgage_interest') {
        allowableDeductionsBreakdown.voluntaryOneOff.ownerOccupiedMortgageInterest += amount;
      } else if (taxTreatment === 'life_insurance_premium') {
        allowableDeductionsBreakdown.voluntaryOneOff.lifeInsurancePremium += amount;
      }
    }
  }

  if (!payeResult) {
    const annualTaxableGross = monthlyGross * 12 + oneOffAllowancesTotal * 12;
    const recurringAllowableDeductions =
      allowableDeductionsBreakdown.voluntaryRecurring.pension +
      allowableDeductionsBreakdown.voluntaryRecurring.nhf +
      allowableDeductionsBreakdown.voluntaryRecurring.nhis +
      allowableDeductionsBreakdown.voluntaryRecurring.ownerOccupiedMortgageInterest +
      allowableDeductionsBreakdown.voluntaryRecurring.lifeInsurancePremium;

    const oneOffAllowableDeductions =
      allowableDeductionsBreakdown.voluntaryOneOff.pension +
      allowableDeductionsBreakdown.voluntaryOneOff.nhf +
      allowableDeductionsBreakdown.voluntaryOneOff.nhis +
      allowableDeductionsBreakdown.voluntaryOneOff.ownerOccupiedMortgageInterest +
      allowableDeductionsBreakdown.voluntaryOneOff.lifeInsurancePremium;

    const annualAllowableDeductions =
      (statutory.employeePension +
        statutory.employeeNhf +
        statutory.employeeNhis +
        recurringAllowableDeductions) *
        12 +
      oneOffAllowableDeductions * 12;

    payeResult = computePaye({
      annualTaxableGross,
      annualAllowableDeductions,
      annualRent,
      enableYtd: false,
      enableRentRelief,
    });
  }

  const computedPaye = payeResult.paye;
  const overrides = run.overrides?.[runItem.id];
  const finalPaye = overrides?.paye
    ? moneyToNumber(overrides.paye)
    : computedPaye;
  const finalEmployeePension = overrides?.employeePension
    ? moneyToNumber(overrides.employeePension)
    : statutory.employeePension;
  const finalEmployerPension = overrides?.employerPension
    ? moneyToNumber(overrides.employerPension)
    : statutory.employerPension;
  const finalEmployeeNhf = overrides?.employeeNhf
    ? moneyToNumber(overrides.employeeNhf)
    : statutory.employeeNhf;
  const finalEmployeeNhis = overrides?.employeeNhis
    ? moneyToNumber(overrides.employeeNhis)
    : statutory.employeeNhis;
  const finalEmployerNhis = overrides?.employerNhis
    ? moneyToNumber(overrides.employerNhis)
    : statutory.employerNhis;
  
  const netPay = monthlyGross + oneOffAllowancesTotal - totalDeductions - (finalPaye ?? 0);
  
  const finalNetPay = overrides?.netPay
    ? moneyToNumber(overrides.netPay)
    : netPay;

  if (ytdData?.exemptIncome) {
    // Use the exempt income breakdown from YTD calculation (includes YTD totals)
    deathInjuryCompensation = ytdData.exemptIncome.deathInjuryCompensation;
    redundancyPayment = ytdData.exemptIncome.redundancyPayment;
    lossOfEmploymentTotal = ytdData.exemptIncome.lossOfEmployment.total;
    lossOfEmploymentExempt = ytdData.exemptIncome.lossOfEmployment.exempt;
    lossOfEmploymentTaxable = ytdData.exemptIncome.lossOfEmployment.taxable;
  } else {
    const exemptAmount = Math.min(lossOfEmploymentTotal, LOSS_OF_EMPLOYMENT_CAP);
    lossOfEmploymentExempt = exemptAmount;
    lossOfEmploymentTaxable = lossOfEmploymentTotal - exemptAmount;
  }

  const prorationMethod = run.settings?.employmentProrationMethod ?? 'calendar_days';
  const isProrated = employmentFraction < 1.0;

  const totalAllowableDeductions =
    allowableDeductionsBreakdown.statutory.pension +
    allowableDeductionsBreakdown.statutory.nhf +
    allowableDeductionsBreakdown.statutory.nhis +
    allowableDeductionsBreakdown.voluntaryRecurring.pension +
    allowableDeductionsBreakdown.voluntaryRecurring.nhf +
    allowableDeductionsBreakdown.voluntaryRecurring.nhis +
    allowableDeductionsBreakdown.voluntaryRecurring.ownerOccupiedMortgageInterest +
    allowableDeductionsBreakdown.voluntaryRecurring.lifeInsurancePremium +
    allowableDeductionsBreakdown.voluntaryOneOff.pension +
    allowableDeductionsBreakdown.voluntaryOneOff.nhf +
    allowableDeductionsBreakdown.voluntaryOneOff.nhis +
    allowableDeductionsBreakdown.voluntaryOneOff.ownerOccupiedMortgageInterest +
    allowableDeductionsBreakdown.voluntaryOneOff.lifeInsurancePremium;

  const taxBreakdown = {
    usedYtd: enableYtd && ytdData != null,
    ytd: ytdData
      ? {
          taxableGrossYtd: numberToMoney(ytdData.projectedAnnualGross * (ytdData.workedMonthUnits / 12)),
          allowableDeductionsYtd: numberToMoney(ytdData.projectedAnnualAllowableDeductions * (ytdData.workedMonthUnits / 12)),
          taxWithheldYtd: numberToMoney(ytdData.taxWithheldYtd),
          workedMonthUnits: ytdData.workedMonthUnits,
          projectedAnnualGross: numberToMoney(ytdData.projectedAnnualGross),
          projectedAnnualAllowableDeductions: numberToMoney(ytdData.projectedAnnualAllowableDeductions),
        }
      : undefined,
    exemptIncome: {
      deathInjuryCompensation: numberToMoney(deathInjuryCompensation),
      redundancyPayment: numberToMoney(redundancyPayment),
      lossOfEmployment: {
        total: numberToMoney(lossOfEmploymentTotal),
        exempt: numberToMoney(lossOfEmploymentExempt),
        taxable: numberToMoney(lossOfEmploymentTaxable),
      },
    },
    allowableDeductions: {
      statutory: {
        pension: numberToMoney(allowableDeductionsBreakdown.statutory.pension),
        nhf: numberToMoney(allowableDeductionsBreakdown.statutory.nhf),
        nhis: numberToMoney(allowableDeductionsBreakdown.statutory.nhis),
      },
      voluntaryRecurring: {
        pension: numberToMoney(allowableDeductionsBreakdown.voluntaryRecurring.pension),
        nhf: numberToMoney(allowableDeductionsBreakdown.voluntaryRecurring.nhf),
        nhis: numberToMoney(allowableDeductionsBreakdown.voluntaryRecurring.nhis),
        ownerOccupiedMortgageInterest: numberToMoney(
          allowableDeductionsBreakdown.voluntaryRecurring.ownerOccupiedMortgageInterest,
        ),
        lifeInsurancePremium: numberToMoney(
          allowableDeductionsBreakdown.voluntaryRecurring.lifeInsurancePremium,
        ),
      },
      voluntaryOneOff: {
        pension: numberToMoney(allowableDeductionsBreakdown.voluntaryOneOff.pension),
        nhf: numberToMoney(allowableDeductionsBreakdown.voluntaryOneOff.nhf),
        nhis: numberToMoney(allowableDeductionsBreakdown.voluntaryOneOff.nhis),
        ownerOccupiedMortgageInterest: numberToMoney(
          allowableDeductionsBreakdown.voluntaryOneOff.ownerOccupiedMortgageInterest,
        ),
        lifeInsurancePremium: numberToMoney(
          allowableDeductionsBreakdown.voluntaryOneOff.lifeInsurancePremium,
        ),
      },
      total: numberToMoney(totalAllowableDeductions),
    },
    rentRelief: {
      annualRent: numberToMoney(annualRent),
      reliefAmount: numberToMoney(payeResult?.annualRentRelief ?? 0),
      applied: enableRentRelief && annualRent > 0,
    },
    taxCalculation: {
      annualTaxableIncome: numberToMoney(payeResult?.annualTaxableIncome ?? 0),
      annualTax: numberToMoney(payeResult?.annualTax ?? 0),
      taxDueYtd: payeResult?.taxDueYtd != null ? numberToMoney(payeResult.taxDueYtd) : undefined,
      taxWithheldYtd: payeResult?.taxWithheldYtd != null ? numberToMoney(payeResult.taxWithheldYtd) : undefined,
      currentMonthPaye: numberToMoney(finalPaye ?? 0),
    },
    taxBandBreakdown: payeResult?.taxBandBreakdown?.map((band) => ({
      label: band.label,
      rate: band.rate,
      taxableAmount: numberToMoney(band.taxableAmount),
      taxAmount: numberToMoney(band.taxAmount),
    })),
    oneOffAllowances: {
      total: numberToMoney(
        (runItem.edits?.oneOffAllowances?.reduce((sum, item) => sum + moneyToNumber(item.amount), 0) ?? 0),
      ),
      taxable: numberToMoney(oneOffAllowancesTotal),
      exempt: numberToMoney(exemptIncomeTotal),
    },
    employment: {
      fraction: employmentFraction,
      prorated: isProrated,
      prorationMethod: isProrated ? prorationMethod : undefined,
    },
  };

  return {
    runItemId: runItem.id,
    gross: numberToMoney(monthlyGross),
    taxableIncome: finalPaye != null ? numberToMoney(monthlyGross) : undefined,
    paye: finalPaye != null ? numberToMoney(finalPaye) : undefined,
    employeePension: numberToMoney(finalEmployeePension),
    employerPension: numberToMoney(finalEmployerPension),
    employeeNhf: numberToMoney(finalEmployeeNhf),
    employeeNhis: numberToMoney(finalEmployeeNhis),
    employerNhis: numberToMoney(finalEmployerNhis),
    totalDeductions: numberToMoney(
      finalEmployeePension +
        finalEmployeeNhf +
        finalEmployeeNhis +
        recurringDeductionsTotal +
        oneOffDeductionsTotal,
    ),
    netPay: numberToMoney(finalNetPay),
    employerCost: numberToMoney(employerCost),
    breakdown: {
      basic: numberToMoney(monthlyBasic),
      housing: numberToMoney(monthlyHousing),
      transport: numberToMoney(monthlyTransport),
    },
    taxBreakdown,
  };
}

/**
 * Detect employees with incomplete rent data for the tax year
 *
 * Returns employee names who have rent relief enabled but rent data that doesn't
 * cover the full tax year (rent periods end before Dec of the tax year).
 *
 * @param run - The payroll run
 * @returns Array of employee names with incomplete rent data
 */
function detectIncompleteRentData(run: PayrollRun): string[] {
  const enableRentRelief = run.settings?.enableRentRelief !== false;
  if (!enableRentRelief) {
    return []; // Rent relief disabled, no warnings needed
  }

  const taxYear = run.periodYear;
  const taxYearEnd = `${taxYear}-12`;
  const employeesWithIncompleteRent: string[] = [];

  for (const item of run.items) {
    const rentHistory = item.payProfileSnapshot.rentHistory;
    if (!rentHistory || rentHistory.length === 0) {
      continue; // No rent data, skip (not incomplete, just missing)
    }

    // Find the latest rent period end date
    let latestEndDate: string | null = null;
    for (const period of rentHistory) {
      const periodEnd = period.toMonth ?? '9999-12';
      if (!latestEndDate || periodEnd > latestEndDate) {
        latestEndDate = periodEnd;
      }
    }

    if (latestEndDate && latestEndDate < taxYearEnd) {
      employeesWithIncompleteRent.push(item.employeeSnapshot.fullName);
    }
  }

  return employeesWithIncompleteRent;
}

/**
 * Compute the entire payroll run.
 * Returns computed results for all run items.
 *
 * This function is now async because it may need to:
 * - Load finalized run history for YTD calculations
 * - Compute PAYE using YTD logic when enabled
 */
export async function computeRun(
  run: PayrollRun,
  options?: { nowIso?: string },
): Promise<PayrollComputedRun> {
  const nowIso = options?.nowIso ?? getCurrentTimestamp();

  // Get the period start month key
  const monthKey = getPeriodStartKey(run);

  // Compute each run item (now async)
  const computedItems: PayrollComputedItem[] = await Promise.all(
    run.items.map((item) => computeRunItem(item, run, monthKey)),
  );

  // Detect incomplete rent data
  const incompleteRentEmployees = detectIncompleteRentData(run);

  // Compute totals
  let grossTotal = 0;
  let netTotal = 0;
  let payeTotal = 0;
  let employeePensionTotal = 0;
  let employerPensionTotal = 0;
  let nhfTotal = 0;
  let employeeNhisTotal = 0;
  let employerNhisTotal = 0;

  for (const item of computedItems) {
    grossTotal += moneyToNumber(item.gross);
    netTotal += moneyToNumber(item.netPay);
    if (item.paye != null) {
      payeTotal += moneyToNumber(item.paye);
    }
    if (item.employeePension != null) {
      employeePensionTotal += moneyToNumber(item.employeePension);
    }
    if (item.employerPension != null) {
      employerPensionTotal += moneyToNumber(item.employerPension);
    }
    if (item.employeeNhf != null) {
      nhfTotal += moneyToNumber(item.employeeNhf);
    }
    if (item.employeeNhis != null) {
      employeeNhisTotal += moneyToNumber(item.employeeNhis);
    }
    if (item.employerNhis != null) {
      employerNhisTotal += moneyToNumber(item.employerNhis);
    }
  }

  return {
    computedAt: nowIso,
    periodTotals: {
      employeeCount: computedItems.length,
      grossTotal: numberToMoney(grossTotal),
      netTotal: numberToMoney(netTotal),
      payeTotal: numberToMoney(payeTotal),
      employeePensionTotal: numberToMoney(employeePensionTotal),
      employerPensionTotal: numberToMoney(employerPensionTotal),
      nhfTotal: numberToMoney(nhfTotal),
      employeeNhisTotal: numberToMoney(employeeNhisTotal),
      employerNhisTotal: numberToMoney(employerNhisTotal),
    },
    items: computedItems,
    warnings:
      incompleteRentEmployees.length > 0
        ? {
            incompleteRentData: incompleteRentEmployees,
          }
        : undefined,
  };
}
