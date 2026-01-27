/**
 * PAYE Computation Module
 *
 * **Single Responsibility**: Pure tax computation from annualized values.
 *
 * This module ONLY computes PAYE tax. It does NOT:
 * - Parse rent history or calculate annual rent (caller provides annual rent)
 * - Extract YTD data (caller provides annualized amounts)
 * - Handle data extraction or transformation
 *
 * **What it does**:
 * - Takes annualized values (gross, deductions, rent)
 * - Applies rent relief (20% of annual rent, capped at 500k)
 * - Computes tax using Nigerian progressive tax bands
 * - Handles both YTD and non-YTD flows
 * - Returns PAYE amount along with rent/relief for display
 *
 * **Usage**: Callers must pre-process all data to annualized values before calling `computePaye`.
 */

/**
 * 2026 Nigerian Tax Bands (Fourth Schedule, Section 58)
 *
 * Used for computing PAYE using progressive tax rates.
 */
const TAX_BANDS = [
  { min: 0, max: 800000, rate: 0 },
  { min: 800000, max: 3000000, rate: 0.15 },
  { min: 3000000, max: 12000000, rate: 0.18 },
  { min: 12000000, max: 25000000, rate: 0.21 },
  { min: 25000000, max: 50000000, rate: 0.23 },
  { min: 50000000, max: Number.POSITIVE_INFINITY, rate: 0.25 },
] as const;

const BAND_LABEL_FORMATTER = new Intl.NumberFormat('en-NG', {
  maximumFractionDigits: 0,
});

export interface TaxBandBreakdownEntry {
  label: string;
  rate: number;
  taxableAmount: number;
  taxAmount: number;
}

function getBandLabel(band: typeof TAX_BANDS[number]): string {
  const lower = BAND_LABEL_FORMATTER.format(band.min);
  const range =
    band.max === Number.POSITIVE_INFINITY
      ? `Above ₦${lower}`
      : `₦${lower} - ₦${BAND_LABEL_FORMATTER.format(band.max)}`;
  return range;
}

function computeAnnualTaxWithBreakdown(
  annualTaxableIncome: number,
): { annualTax: number; breakdown: TaxBandBreakdownEntry[] } {
  const normalizedIncome = Math.max(0, annualTaxableIncome);
  let tax = 0;
  const breakdown: TaxBandBreakdownEntry[] = [];

  for (const band of TAX_BANDS) {
    if (normalizedIncome <= band.min) {
      break;
    }
    const upper = Math.min(normalizedIncome, band.max);
    const amountInBand = Math.max(0, upper - band.min);
    if (amountInBand <= 0) {
      continue;
    }
    const taxForBand = amountInBand * band.rate;
    breakdown.push({
      label: getBandLabel(band),
      rate: band.rate,
      taxableAmount: amountInBand,
      taxAmount: taxForBand,
    });
    tax += taxForBand;
  }

  return { annualTax: tax, breakdown };
}

/**
 * Nigerian minimum wage exemption (2026)
 *
 * Anyone earning minimum wage or less is fully exempt from PAYE.
 * We model this as a hard exemption on ANNUAL GROSS income.
 *
 * - Monthly minimum wage: 70,000
 * - Annual minimum wage: 840,000
 *
 * If `annualTaxableGross` (annual gross income) is <= this amount,
 * PAYE must be zero regardless of deductions or tax bands.
 */
const MINIMUM_WAGE_MONTHLY = 70_000;
const MINIMUM_WAGE_ANNUAL = MINIMUM_WAGE_MONTHLY * 12;

/**
 * Compute annual tax using tax bands
 *
 * This is the core PAYE computation logic. It applies progressive tax rates
 * to annual taxable income using the Nigerian tax bands.
 *
 * @param annualTaxableIncome - Annual taxable income (after deductions and reliefs)
 * @returns Annual tax amount
 */
function computeAnnualTax(annualTaxableIncome: number): number {
  return computeAnnualTaxWithBreakdown(annualTaxableIncome).annualTax;
}

/**
 * Compute annual tax from annualized amounts (internal helper)
 *
 * @param annualTaxableGross - Annual taxable gross income
 * @param annualAllowableDeductions - Annual allowable deductions (pension, NHF, NHIS, etc.)
 * @param annualRentRelief - Annual rent relief (default: 0)
 * @returns Annual tax amount
 */
export function computeAnnualTaxFromAmounts(
  annualTaxableGross: number,
  annualAllowableDeductions: number,
  annualRentRelief: number = 0,
): number {
  // Minimum wage exemption: no tax if annual gross is at or below minimum wage
  if (annualTaxableGross <= MINIMUM_WAGE_ANNUAL) {
    return 0;
  }

  // Annual taxable income = gross - rent relief - allowable deductions
  const annualTaxableIncome =
    annualTaxableGross - annualRentRelief - annualAllowableDeductions;

  // Compute annual tax
  return computeAnnualTax(annualTaxableIncome);
}

/**
 * Unified PAYE computation result
 */
export interface ComputePayeResult {
  /** Monthly PAYE amount */
  paye: number | undefined;
  /** Annual rent paid for the tax year */
  annualRent: number;
  /** Annual rent relief (20% of annual rent, capped at 500,000) */
  annualRentRelief: number;
  /** Annual taxable income (gross - rent relief - allowable deductions) */
  annualTaxableIncome: number;
  /** Annual tax computed */
  annualTax: number;
  /** Tax due YTD (if YTD flow) */
  taxDueYtd?: number;
  /** Tax already withheld YTD (if YTD flow) */
  taxWithheldYtd?: number;
  /** Tax band breakdown used for the annual tax computation */
  taxBandBreakdown: TaxBandBreakdownEntry[];
}

/**
 * Compute PAYE from annualized values
 *
 * **Pure computation function** - takes annualized values and computes tax.
 * All data extraction and annualization must be done by the caller.
 *
 * **Rent Relief**: Calculates rent relief internally (20% of annual rent, capped at 500k).
 * Caller provides annual rent amount - this function handles the relief calculation.
 *
 * **YTD Flow** (default, when enableYtd is true):
 * - Requires: workedMonthUnits and taxWithheldYtd
 * - Computes annual tax on projected income
 * - Converts to YTD tax due
 * - Subtracts tax already withheld to get current month PAYE
 *
 * **Non-YTD Flow** (when enableYtd is false):
 * - Computes annual tax on provided annualized amounts
 * - Converts to monthly PAYE (divides by 12)
 *
 * @param params - PAYE computation parameters (all values must be annualized)
 * @param params.annualTaxableGross - Annual taxable gross income
 * @param params.annualAllowableDeductions - Annual allowable deductions (pension, NHF, NHIS)
 * @param params.annualRent - Total annual rent paid for the tax year
 * @param params.enableYtd - Whether to use YTD computation (default: true)
 * @param params.enableRentRelief - Whether to apply rent relief (default: true)
 * @param params.workedMonthUnits - Total worked month units YTD (required for YTD)
 * @param params.taxWithheldYtd - Tax already withheld YTD (required for YTD)
 * @returns PAYE computation result (PAYE amount, annual rent, rent relief)
 */
export function computePaye(params: {
  annualTaxableGross: number;
  annualAllowableDeductions: number;
  annualRent: number;
  enableYtd?: boolean;
  enableRentRelief?: boolean;
  workedMonthUnits?: number;
  taxWithheldYtd?: number;
}): ComputePayeResult {
  const {
    annualTaxableGross,
    annualAllowableDeductions,
    annualRent,
    enableYtd = true,
    enableRentRelief = true,
    workedMonthUnits,
    taxWithheldYtd,
  } = params;

  // Calculate rent relief from annual rent (only if enabled)
  const annualRentRelief = enableRentRelief
    ? calculateRentReliefFromAnnualRent(annualRent)
    : 0;

  // Calculate annual taxable income and tax
  const annualTaxableIncome =
    annualTaxableGross - annualRentRelief - annualAllowableDeductions;
  const annualTaxDetails =
    annualTaxableGross <= MINIMUM_WAGE_ANNUAL
      ? { annualTax: 0, breakdown: [] as TaxBandBreakdownEntry[] }
      : computeAnnualTaxWithBreakdown(annualTaxableIncome);
  const annualTax = annualTaxDetails.annualTax;
  const taxBandBreakdown = annualTaxDetails.breakdown;
  const baseResult = {
    annualRent,
    annualRentRelief,
    annualTaxableIncome,
    annualTax,
    taxBandBreakdown,
  };

  // YTD flow (default)
  if (enableYtd !== false) {
    // YTD requires workedMonthUnits and taxWithheldYtd
    if (workedMonthUnits == null || taxWithheldYtd == null) {
      return {
        paye: undefined,
        ...baseResult,
      };
    }
    // If no months worked, cannot compute
    if (workedMonthUnits === 0) {
      return {
        paye: undefined,
        ...baseResult,
      };
    }

    // Convert to tax due YTD
    const taxDueYtd = annualTax * (workedMonthUnits / 12);

    // Current month PAYE = tax due YTD - tax withheld before this month
    const payeThisMonth = taxDueYtd - taxWithheldYtd;

    // Ensure non-negative (shouldn't happen, but safety check)
    return {
      paye: Math.max(0, payeThisMonth),
      taxDueYtd,
      taxWithheldYtd,
      ...baseResult,
    };
  }

  // Non-YTD flow: simple annualization
  // Convert to monthly PAYE
  return {
    paye: annualTax / 12,
    ...baseResult,
  };
}

/**
 * Rent relief constants (Nigerian tax law)
 *
 * Rent relief is calculated as 20% of annual rent paid, subject to a maximum of 500,000 Naira.
 */
const RENT_RELIEF_RATE = 0.2; // 20%
const RENT_RELIEF_CAP = 500_000; // 500,000 Naira maximum

/**
 * Calculate rent relief from annual rent amount
 *
 * **Nigerian Tax Law**: Rent relief is 20% of annual rent paid, capped at 500,000 Naira.
 *
 * @param annualRent - Total annual rent paid for the tax year
 * @returns Annual rent relief amount (0 to 500,000)
 */
function calculateRentReliefFromAnnualRent(annualRent: number): number {
  const relief = Math.min(annualRent * RENT_RELIEF_RATE, RENT_RELIEF_CAP);
  return Math.max(0, relief);
}
