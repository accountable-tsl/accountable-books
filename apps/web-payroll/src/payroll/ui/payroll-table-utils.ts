import type {
  PayrollComputedItem,
  PayrollRunItem,
} from '../domain';

/**
 * Table row data format for display
 */
export interface TableRowData {
  id: string;
  name: string;
  role: string | undefined;
  monthlyGross: number;
  monthlyBasic: number;
  monthlyHousing: number;
  monthlyTransport: number;
  paye: number | undefined;
  employeePension: number;
  employerPension: number;
  employeeNhf: number | undefined;
  employeeNhis: number | undefined;
  employerNhis: number | undefined;
  totalDeductions: number | undefined;
  netPay: number;
  employerCost: number | undefined;
}

/**
 * Convert money string to number
 */
function moneyToNumber(money: string): number {
  return parseFloat(money);
}

/**
 * Get table row data from run item and computed item
 */
export function getTableRowData(
  runItem: PayrollRunItem,
  computedItem?: PayrollComputedItem,
): TableRowData {
  // Extract basic info from runItem
  const name = runItem.employeeSnapshot.fullName;
  const role = runItem.employeeSnapshot.role;

  // Get compensation from history
  const compHistory = runItem.payProfileSnapshot.compensationHistory;
  const annualGross =
    compHistory.length > 0
      ? moneyToNumber(compHistory[0].annualGross)
      : 0;

  // Monthly gross derived from annual
  const monthlyGross = annualGross / 12;

  // Extract breakdown from computed item if available
  const monthlyBasic = computedItem?.breakdown?.basic
    ? moneyToNumber(computedItem.breakdown.basic)
    : monthlyGross; // Fallback to gross if no breakdown
  const monthlyHousing = computedItem?.breakdown?.housing
    ? moneyToNumber(computedItem.breakdown.housing)
    : 0;
  const monthlyTransport = computedItem?.breakdown?.transport
    ? moneyToNumber(computedItem.breakdown.transport)
    : 0;

  // Extract computed values
  const paye = computedItem?.paye
    ? moneyToNumber(computedItem.paye)
    : undefined;
  const employeePension = computedItem?.employeePension
    ? moneyToNumber(computedItem.employeePension)
    : 0;
  const employerPension = computedItem?.employerPension
    ? moneyToNumber(computedItem.employerPension)
    : 0;
  const employeeNhf = computedItem?.employeeNhf
    ? moneyToNumber(computedItem.employeeNhf)
    : undefined;
  const employeeNhis = computedItem?.employeeNhis
    ? moneyToNumber(computedItem.employeeNhis)
    : undefined;
  const employerNhis = computedItem?.employerNhis
    ? moneyToNumber(computedItem.employerNhis)
    : undefined;
  const totalDeductions = computedItem?.totalDeductions
    ? moneyToNumber(computedItem.totalDeductions)
    : undefined;
  const netPay = computedItem?.netPay
    ? moneyToNumber(computedItem.netPay)
    : monthlyGross;
  const employerCost = computedItem?.employerCost
    ? moneyToNumber(computedItem.employerCost)
    : undefined;

  return {
    id: runItem.id,
    name,
    role,
    monthlyGross,
    monthlyBasic,
    monthlyHousing,
    monthlyTransport,
    paye,
    employeePension,
    employerPension,
    employeeNhf,
    employeeNhis,
    employerNhis,
    totalDeductions,
    netPay,
    employerCost,
  };
}

/**
 * Get monthly basic from annual gross and breakdown
 * This is used when editing - user enters monthly basic, we need to show it
 */
export function getMonthlyBasicFromAnnualGross(
  annualGross: number,
  breakdown?: { basic?: number; housing?: number; transport?: number },
): number {
  if (!breakdown || breakdown.basic == null) {
    // If no breakdown, assume 100% basic
    return annualGross / 12;
  }
  // Breakdown is a rate (0-1), so multiply annualGross by it
  return (annualGross * breakdown.basic) / 12;
}

/**
 * Calculate annual gross from monthly basic and breakdown
 * This is used when user edits monthly basic - we need to calculate annual gross
 */
export function calculateAnnualGrossFromMonthlyBasic(
  monthlyBasic: number,
  breakdown?: { basic?: number; housing?: number; transport?: number },
): number {
  const annualBasic = monthlyBasic * 12;
  if (!breakdown || breakdown.basic == null || breakdown.basic === 0) {
    // If no breakdown or basic is 0, assume 100% basic
    return annualBasic;
  }
  // If breakdown exists, annualGross = annualBasic / basicRate
  return annualBasic / breakdown.basic;
}
