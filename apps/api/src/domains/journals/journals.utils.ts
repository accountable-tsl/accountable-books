import type { JournalTransactionData } from './journals.types.js';

export function validateDebitCreditBalance(
  transactions: JournalTransactionData[],
): {
  isValid: boolean;
  error?: string;
  totalDebits: number;
  totalCredits: number;
} {
  const { debit, credit } = transactions.reduce(
    ({ debit, credit }, t) => ({
      debit: t.side === 'debit' ? debit + t.amount : debit,
      credit: t.side === 'credit' ? credit + t.amount : credit,
    }),
    { debit: 0, credit: 0 },
  );

  const difference = Math.abs(debit - credit);
  const tolerance = 0.0000000001;

  if (difference > tolerance) {
    return {
      isValid: false,
      error: `Debits and credits do not balance. Debits: ${debit}, Credits: ${credit}, Difference: ${difference}`,
      totalDebits: debit,
      totalCredits: credit,
    };
  }

  return {
    isValid: true,
    totalDebits: debit,
    totalCredits: credit,
  };
}
