import { FormattedAmount } from '@/components/FormattedAmount';
import { cn } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import type { ParsedBankTxn } from '@/modules/banking/transactions/model/types';

export function getBankTxnFields(currencyCode: string): ColumnDef<ParsedBankTxn>[] {
  return [
    { id: 'date', header: 'Date', accessorKey: 'formattedDate', size: 120 },
    { id: 'payee', header: 'Payee', accessorKey: 'payee', size: 120 },
    {
      id: 'description',
      header: 'Description',
      accessorKey: 'description',
    },
    {
      id: 'moneyIn',
      header: () => <div className="text-right">Money In</div>,
      accessorKey: 'moneyIn',
      size: 150,
      cell: (props: any) => {
        const amt = Number(props.getValue());
        return (
          <div
            className={cn(
              'text-right',
              amt > 0 ? 'text-green-500' : '',
              amt === 0 ? 'text-muted-foreground' : '',
            )}
          >
            {amt === 0 ? '-' : <FormattedAmount amount={amt} currency={currencyCode} showSymbol />}
          </div>
        );
      },
    },
    {
      id: 'moneyOut',
      header: () => <div className="text-right">Money Out</div>,
      accessorKey: 'moneyOut',
      size: 150,
      cell: (props: any) => {
        const amt = Number(props.getValue());
        return (
          <div
            className={cn(
              'text-right',
              amt > 0 ? 'text-red-500' : '',
              amt === 0 ? 'text-muted-foreground' : '',
            )}
          >
            {amt === 0 ? '-' : <FormattedAmount amount={amt} currency={currencyCode} showSymbol />}
          </div>
        );
      },
    },
  ];
}
