import { getCurrentTimestamp, getPeriodStartKey } from '../utils';

import {
  resolveBhtBreakdown,
  resolveNhfConfig,
  resolveNhisConfig,
  resolvePensionConfig,
  resolveState,
} from './resolve-settings';

import type {
  PayrollComputedItem,
  PayrollComputedRun,
  PayrollRun,
  PayrollRunItem,
} from '../domain';

/**
 * Compute annual split from annualGross and BHT breakdown rates.
 * Reused pattern from tax-logic.ts but adapted for BhtBreakdown type.
 */
function computeAnnualSplit(
  annualGross: number,
  breakdown: { basic?: number; housing?: number; transport?: number },
): {
  annualBasic: number;
  annualHousing: number;
  annualTransport: number;
  annualOtherAllowances: number;
} {
  // If no breakdown provided, default to 100% basic
  if (!breakdown || (!breakdown.basic && !breakdown.housing && !breakdown.transport)) {
    return {
      annualBasic: annualGross,
      annualHousing: 0,
      annualTransport: 0,
      annualOtherAllowances: 0,
    };
  }

  // Breakdown is in rates (0-1), so multiply annualGross by each rate
  const basicRate = breakdown.basic ?? 0;
  const housingRate = breakdown.housing ?? 0;
  const transportRate = breakdown.transport ?? 0;

  const annualBasic = annualGross * basicRate;
  const annualHousing = annualGross * housingRate;
  const annualTransport = annualGross * transportRate;
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
 */
function computeStatutoryDeductions(
  runItem: PayrollRunItem,
  run: PayrollRun,
  monthlyBasic: number,
  monthlyHousing: number,
  monthlyTransport: number,
): {
  employeePension: number;
  employerPension: number;
  employeeNhf: number;
  employeeNhis: number;
  employerNhis: number;
} {
  const pensionConfig = resolvePensionConfig(
    runItem,
    run.settings,
    undefined, // system defaults handled in resolve function
  );
  const nhfConfig = resolveNhfConfig(runItem, run.settings);
  const nhisConfig = resolveNhisConfig(runItem, run.settings);

  // Pension base: Basic + Housing + Transport
  const pensionBase = monthlyBasic + monthlyHousing + monthlyTransport;

  // Compute pension
  let employeePension = 0;
  let employerPension = 0;
  if (pensionConfig.enabled !== false) {
    // Default rates if not specified
    const eeRate = pensionConfig.employeeRate ?? 0.08; // 8%
    const erRate = pensionConfig.employerRate ?? 0.1; // 10%

    if (pensionConfig.employeeAmount != null) {
      employeePension = moneyToNumber(pensionConfig.employeeAmount);
    } else {
      employeePension = pensionBase * eeRate;
    }

    if (pensionConfig.employerAmount != null) {
      employerPension = moneyToNumber(pensionConfig.employerAmount);
    } else {
      employerPension = pensionBase * erRate;
    }
  }

  // NHF: 2.5% of Basic only
  let employeeNhf = 0;
  if (nhfConfig.enabled !== false) {
    const nhfRate = nhfConfig.employeeRate ?? 0.025; // 2.5%
    if (nhfConfig.employeeAmount != null) {
      employeeNhf = moneyToNumber(nhfConfig.employeeAmount);
    } else {
      employeeNhf = monthlyBasic * nhfRate;
    }
  }

  // NHIS: employee 5%, employer 10% of Basic only
  let employeeNhis = 0;
  let employerNhis = 0;
  if (nhisConfig.enabled !== false) {
    const eeNhisRate = nhisConfig.employeeRate ?? 0.05; // 5%
    const erNhisRate = nhisConfig.employerRate ?? 0.1; // 10%

    if (nhisConfig.employeeAmount != null) {
      employeeNhis = moneyToNumber(nhisConfig.employeeAmount);
    } else {
      employeeNhis = monthlyBasic * eeNhisRate;
    }

    if (nhisConfig.employerAmount != null) {
      employerNhis = moneyToNumber(nhisConfig.employerAmount);
    } else {
      employerNhis = monthlyBasic * erNhisRate;
    }
  }

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
 */
function computeRunItem(
  runItem: PayrollRunItem,
  run: PayrollRun,
  monthKey: string,
): PayrollComputedItem {
  // Get compensation from history
  const compHistory = runItem.payProfileSnapshot.compensationHistory;
  if (compHistory.length === 0) {
    throw new Error(
      `No compensation history found for employee ${runItem.employeeSnapshot.fullName}`,
    );
  }

  // For now, use the first compensation period (we'll handle multi-period later)
  const comp = compHistory[0];
  const annualGross = moneyToNumber(comp.annualGross);

  // Resolve BHT breakdown with precedence
  const breakdown = resolveBhtBreakdown(runItem, run.settings);

  // Compute annual split
  const { annualBasic, annualHousing, annualTransport } =
    computeAnnualSplit(annualGross, breakdown);

  // Convert to monthly (employmentFraction = 1.0 for now, no proration)
  const employmentFraction = 1.0;
  const monthlyGross = (annualGross / 12) * employmentFraction;
  const monthlyBasic = (annualBasic / 12) * employmentFraction;
  const monthlyHousing = (annualHousing / 12) * employmentFraction;
  const monthlyTransport = (annualTransport / 12) * employmentFraction;

  // Compute statutory deductions
  const statutory = computeStatutoryDeductions(
    runItem,
    run,
    monthlyBasic,
    monthlyHousing,
    monthlyTransport,
  );

  // Compute one-off allowances and deductions from edits
  let oneOffAllowancesTotal = 0;
  let oneOffDeductionsTotal = 0;
  if (runItem.edits) {
    if (runItem.edits.oneOffAllowances) {
      oneOffAllowancesTotal = runItem.edits.oneOffAllowances.reduce(
        (sum, item) => sum + moneyToNumber(item.amount),
        0,
      );
    }
    if (runItem.edits.oneOffDeductions) {
      oneOffDeductionsTotal = runItem.edits.oneOffDeductions.reduce(
        (sum, item) => sum + moneyToNumber(item.amount),
        0,
      );
    }
  }

  // Compute recurring deductions from payProfileSnapshot
  let recurringDeductionsTotal = 0;
  if (runItem.payProfileSnapshot.recurringDeductions) {
    recurringDeductionsTotal = runItem.payProfileSnapshot.recurringDeductions.reduce(
      (sum, deduction) => {
        // Check if deduction applies to this month
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

  // Total deductions
  const totalDeductions =
    statutory.employeePension +
    statutory.employeeNhf +
    statutory.employeeNhis +
    recurringDeductionsTotal +
    oneOffDeductionsTotal;

  // Net pay
  const netPay = monthlyGross + oneOffAllowancesTotal - totalDeductions;

  // Employer cost
  const employerCost =
    monthlyGross +
    statutory.employerPension +
    statutory.employerNhis +
    oneOffAllowancesTotal;

  // For now, PAYE is not computed (can be added later using tax-logic.ts pattern)
  // Taxable income would be computed from annual values

  // Apply overrides if they exist
  const overrides = run.overrides?.[runItem.id];
  const finalPaye = overrides?.paye
    ? moneyToNumber(overrides.paye)
    : undefined;
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
  const finalNetPay = overrides?.netPay
    ? moneyToNumber(overrides.netPay)
    : netPay;

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
  };
}

/**
 * Compute the entire payroll run.
 * Returns computed results for all run items.
 */
export function computeRun(
  run: PayrollRun,
  options?: { nowIso?: string },
): PayrollComputedRun {
  const nowIso = options?.nowIso ?? getCurrentTimestamp();

  // Get the period start month key
  const monthKey = getPeriodStartKey(run);

  // Compute each run item
  const computedItems: PayrollComputedItem[] = run.items.map((item) =>
    computeRunItem(item, run, monthKey),
  );

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
    employeePensionTotal += moneyToNumber(item.employeePension);
    employerPensionTotal += moneyToNumber(item.employerPension);
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
      payeTotal: payeTotal > 0 ? numberToMoney(payeTotal) : undefined,
      employeePensionTotal: numberToMoney(employeePensionTotal),
      employerPensionTotal: numberToMoney(employerPensionTotal),
      nhfTotal: nhfTotal > 0 ? numberToMoney(nhfTotal) : undefined,
      employeeNhisTotal:
        employeeNhisTotal > 0 ? numberToMoney(employeeNhisTotal) : undefined,
      employerNhisTotal:
        employerNhisTotal > 0 ? numberToMoney(employerNhisTotal) : undefined,
    },
    items: computedItems,
  };
}
