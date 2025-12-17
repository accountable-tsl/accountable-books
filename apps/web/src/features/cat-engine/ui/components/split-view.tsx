import { format } from 'date-fns';
import { Split } from 'lucide-react';

import { FormattedAmount } from '@/components/FormattedAmount';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { GroupedTransaction } from '@/modules/accounting/categorization';

export function SplitViewDialog({ txn }: { txn: GroupedTransaction }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          className="flex items-center gap-1 cursor-pointer font-light hover:underline decoration-current"
          onClick={(e) => e.stopPropagation()}
        >
          <Split className="w-3 h-3 text-muted-foreground" />
          <span className="text-blue-500">View entries ({txn.entryCount})</span>
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split Transaction Entries</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>
              Date: {format(new Date(txn.date), 'dd MMM yyyy')} | Bank Amount:{' '}
              <FormattedAmount
                amount={txn.totalBankAmount}
                currency={txn.bankAccountCurrencyCode}
                accountingNegatives={false}
              />
            </p>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
              <div className="col-span-4">Account</div>
              <div className="col-span-2">Description</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-2 text-right">Contact</div>
              <div className="col-span-2 text-right">Project</div>
            </div>
            {txn.entries?.map((line, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 text-sm border-b last:border-0 pb-2 last:pb-0"
              >
                <div className="col-span-4">
                  <div className="font-medium">
                    {line.coaName || 'Uncategorized'}
                  </div>
                  {line.coaCode && (
                    <div className="text-xs text-muted-foreground">
                      {line.coaCode}
                    </div>
                  )}
                </div>
                <div className="col-span-2 text-muted-foreground">
                  {line.description || '-'}
                </div>
                {/* <div className="col-span-2 text-right">
                  <FormattedAmount
                    amount={line.}
                    currency={txn.bank_currency_code}
                    accountingNegatives={false}
                    className={cn(
                      line.reporting_amount < 0
                        ? 'text-destructive'
                        : 'text-green-600',
                    )}
                  />
                </div>
                <div className="col-span-2 text-right text-muted-foreground">
                  {line.contact_name || '-'}
                </div>
                <div className="col-span-2 text-right text-muted-foreground">
                  {line.project_name || '-'}
                </div> */}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
