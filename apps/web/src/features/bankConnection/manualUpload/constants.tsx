import { SpreadsheetImporterField } from '@/features/spreadsheets/types';
import { formatDate, parseDateString } from '@/shared/utils/formatting-utils';
import { FormattedAmount } from '@/components/FormattedAmount';
import Decimal from 'decimal.js';

const fieldMatchers = {
  date: ['*Date', 'Date', 'Date*', 'date'],
  amount: ['*Amount', 'Amount', 'Amount*', 'amount'],
  payee: ['Contact / Payee', 'Contact/Payee', 'Payee', 'payee', 'contact', 'contact / payee'],
  description: ['Description', 'description'],
  reference: ['Reference', 'reference'],
  additionalComments: ['Additional Comments', 'additional comments', 'comments'],
  coaCode: ['Account Code', 'account code', 'coa code'],
  coaName: ['Account Name', 'account name', 'coa name'],
};

export const bankTransactionImporterfields: SpreadsheetImporterField[] = [
  {
    label: '*Date',
    value: 'date',
    required: true,
    possibleFields: fieldMatchers.date,
    render: (value) => {
      const parsedDate = parseDateString(value);
      if (!parsedDate) return '';
      return formatDate(parsedDate);
    },
    width: '7.5rem',
  },
  {
    label: '*Amount',
    value: 'amount',
    required: true,
    possibleFields: fieldMatchers.amount,
    align: 'right',
    width: '8.5rem',
    className: 'truncate max-w-[10rem]',
    render: (value, _row, _rowIdx, currency) => {
      const amt = new Decimal(value);
      return (
        <FormattedAmount
          amount={value}
          currency={currency}
          showSymbol
          className="flex w-full truncate overflow-hidden"
          valueClassName={`${amt.lt(0) ? 'text-red-500' : ''} flex-1`}
        />
      );
    },
  },
  {
    label: 'Contact / Payee',
    value: 'payee',
    possibleFields: fieldMatchers.payee,
  },
  {
    label: 'Description',
    value: 'description',
    possibleFields: fieldMatchers.description,
  },
  {
    label: 'Reference',
    value: 'reference',
    possibleFields: fieldMatchers.reference,
  },
  { label: 'Additional Comments', value: 'additionalComments' },
  //   {
  //     label: "Account Code",
  //     value: "coaCode",
  //     possibleFields: fieldMatchers.coaCode,
  //   },
  //   {
  //     label: "Account Name",
  //     value: "coaName",
  //     possibleFields: fieldMatchers.coaName,
  //   },
];
