import { AppError } from '../../shared/utils/response.utils.js';
import { fxTransactionIdInputSchema } from './fx.types.js';

import type { FxTransactionIdInput } from './fx.types.js';

/**
 * Sanitize a part of an fx_transaction_id to prevent collisions
 * Removes colons and other problematic characters
 */
export function sanitizeFxIdPart(part: string): string {
  if (!part) {
    throw new Error('fx_transaction_id part cannot be empty');
  }
  // Remove colons (used as separators) and normalize
  return part.replace(/:/g, '_').trim();
}

/**
 * Generate an fx_transaction_id based on the source type
 *
 * Formats:
 * - JRN: "JRN:<journal_batch_id>"
 * - LEDGER_TX: "LEDGER_TX:<ledger_transaction_id>"
 * - CASH: "CASH:<bank_account_id>:<currency_id>"
 * - LOAN: "LOAN:<loan_id>"
 * - LOAN_DRAW: "LOAN_DRAW:<loan_draw_id>"
 *
 * @param input - Source type and associated IDs
 * @returns Sanitized fx_transaction_id string
 */
export function makeFxTransactionId(input: FxTransactionIdInput): string {
  // Validate input
  const validationResult = fxTransactionIdInputSchema.safeParse(input);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.issues
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new AppError(
      `Invalid fx_transaction_id input: ${errorMessages}`,
      validationResult.error.format(),
    );
  }

  const validatedInput = validationResult.data;
  switch (validatedInput.type) {
    case 'JRN':
      return `JRN:${sanitizeFxIdPart(validatedInput.journalBatchId)}`;

    case 'LEDGER_TX':
      return `LEDGER_TX:${sanitizeFxIdPart(validatedInput.ledgerTransactionId)}`;

    case 'CASH':
      // One lot per bank account per currency
      return `CASH:${sanitizeFxIdPart(validatedInput.bankAccountId)}:${sanitizeFxIdPart(
        validatedInput.currencyId,
      )}`;

    case 'LOAN':
      return `LOAN:${sanitizeFxIdPart(validatedInput.loanId)}`;

    case 'LOAN_DRAW':
      return `LOAN_DRAW:${sanitizeFxIdPart(validatedInput.loanDrawId)}`;

    default:
      // Exhaustive check
      const _exhaustive: never = validatedInput;
      throw new Error(`Unknown fx lot type: ${_exhaustive}`);
  }
}
