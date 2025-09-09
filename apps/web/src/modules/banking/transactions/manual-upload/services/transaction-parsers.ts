import {
  type BankTransactionInsert,
  type ParsedBankTxn,
  rawRowSchema,
  type TransformResult,
} from '@/modules/banking/transactions/model/types';
import { debitCredit } from '@/shared/types/core';
import { findDateRange, parseDateString, safeFormatDate } from '@/shared/utils/formatting-utils';

export function transformParsedData({
  data,
  bankAccountId,
}: {
  data: any;
  bankAccountId: string;
}): TransformResult {
  if (!data)
    return {
      transactions: [],
      inserts: [],
      errors: [],
      dateRange: null,
      totalMoneyIn: 0,
      totalMoneyOut: 0,
    };

  const transactions: ParsedBankTxn[] = [];
  const inserts: BankTransactionInsert[] = [];
  const errors: {
    rowIndex: number;
    originalRow: any;
    errorMessages: string[];
  }[] = [];
  const dateRange = findDateRange(data, 'date');

  let totalMoneyIn = 0;
  let totalMoneyOut = 0;

  data.forEach((row: any, index: number) => {
    const res = rawRowSchema.safeParse(row);
    if (!res.success) {
      errors.push({
        rowIndex: index,
        originalRow: row,
        errorMessages: res.error.errors.map((err) => {
          const field = err.path.join('.');
          return `${field ? `${field}: ` : ''}${err.message}`;
        }),
      });
      return;
    }

    const { amount, description, payee, reference, additionalComments } = res.data;

    const fDate = parseDateString(row.date) || new Date(row.date.toString());
    const transactionSide = amount > 0 ? debitCredit.enum.credit : debitCredit.enum.debit;

    const y = {
      date: fDate,
      amount,
      bankAccountId,
      transactionSide,
      description,
      payee,
      reference,
      additionalComments,
      rawData: row,
    };

    const { rawData, ...rest } = y;

    const x = {
      ...rest,
      formattedDate: safeFormatDate({
        date: fDate,
        formatString: 'dd MMM yyyy',
      }),
      moneyIn: amount > 0 ? amount : '',
      moneyOut: amount < 0 ? Math.abs(amount) : '',
    } satisfies ParsedBankTxn;

    transactions.push(x);
    inserts.push(y);

    if (amount > 0) totalMoneyIn += amount;
    else if (amount < 0) totalMoneyOut += Math.abs(amount);
  });

  return {
    transactions,
    inserts,
    dateRange,
    errors,
    totalMoneyIn,
    totalMoneyOut,
  };
}
