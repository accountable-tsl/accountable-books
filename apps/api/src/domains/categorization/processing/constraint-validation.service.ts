import type { PredictionLineDraft } from '../post-prediction/predictions/predictions.service.js';

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
 * - Amounts must be positive (native currency only)
 * - Debit/credit must balance on native amounts
 * - Must include exactly one bank leg
 *
 * Note: Exchange rate conversion (amountReporting) is not validated here.
 * Exchange rates are calculated at posting time when creating ledger entries.
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
    // Note: amountReporting is not validated here - exchange rate conversion happens at posting time
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

  // Note: amountReporting validation removed - exchange rate conversion happens at posting time, not during prediction

  const hasError = violations.some((v) => v.severity === 'error');

  return {
    isValid: !hasError,
    violations,
  };
}
