import type { PredictionLineDraft } from '../predictions/predictions.repository.js';

export interface ConstraintViolation {
  type: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ConstraintValidationResult {
  isValid: boolean;
  violations: ConstraintViolation[];
}

/**
 * Validate a prediction against accounting constraints.
 *
 * Blocking rules (severity=error):
 * - Amounts must be positive
 * - Debit/credit must balance on native amounts
 * - Must include exactly one bank leg
 *
 * Warning rules (severity=warning):
 * - Missing reporting amount on non-bank legs
 *
 * Future enhancements:
 * - Validate COA existence/active status
 * - Currency validations against company ledger
 * - Project existence
 */
export async function validateConstraints(
  _predictionId: string,
  lines: PredictionLineDraft[],
): Promise<ConstraintValidationResult> {
  const violations: ConstraintViolation[] = [];

  if (!lines.length) {
    violations.push({
      type: 'no_lines',
      severity: 'error',
      message: 'Prediction has no lines to validate',
    });
    return { isValid: false, violations };
  }

  // Amounts must be positive
  for (const [index, line] of lines.entries()) {
    if (line.amountNative <= 0 || Number.isNaN(line.amountNative)) {
      violations.push({
        type: 'amount_native_non_positive',
        severity: 'error',
        message: `Line ${index + 1} has non-positive amount_native`,
        metadata: { index, amountNative: line.amountNative },
      });
    }
    if (
      line.amountReporting !== null &&
      line.amountReporting !== undefined &&
      (line.amountReporting <= 0 || Number.isNaN(line.amountReporting))
    ) {
      violations.push({
        type: 'amount_reporting_non_positive',
        severity: 'error',
        message: `Line ${index + 1} has non-positive amount_reporting`,
        metadata: { index, amountReporting: line.amountReporting },
      });
    }
  }

  // Debit/credit must balance on native amounts
  const debitSum = lines
    .filter((line) => line.entryType === 'debit')
    .reduce((sum, line) => sum + line.amountNative, 0);
  const creditSum = lines
    .filter((line) => line.entryType === 'credit')
    .reduce((sum, line) => sum + line.amountNative, 0);

  if (Math.round((debitSum - creditSum) * 100) !== 0) {
    violations.push({
      type: 'unbalanced_native_amounts',
      severity: 'error',
      message: `Debit (${debitSum}) and credit (${creditSum}) do not balance`,
      metadata: { debitSum, creditSum },
    });
  }

  // Must include exactly one bank leg
  const bankLegs = lines.filter((line) => line.isBankLeg);
  if (bankLegs.length !== 1) {
    violations.push({
      type: 'invalid_bank_leg_count',
      severity: 'error',
      message: `Expected exactly one bank leg, found ${bankLegs.length}`,
      metadata: { bankLegCount: bankLegs.length },
    });
  }

  // Warn if reporting amount missing on non-bank legs (data quality)
  lines.forEach((line, index) => {
    if (
      !line.isBankLeg &&
      (line.amountReporting === null || line.amountReporting === undefined)
    ) {
      violations.push({
        type: 'missing_reporting_amount',
        severity: 'warning',
        message: `Line ${index + 1} missing amount_reporting`,
        metadata: { index },
      });
    }
  });

  const hasError = violations.some((v) => v.severity === 'error');

  return {
    isValid: !hasError,
    violations,
  };
}
