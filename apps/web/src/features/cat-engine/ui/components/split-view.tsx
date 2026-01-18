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
import type { GroupedTransaction } from '@/modules/accounting/categorization';

export function SplitViewDialog({ txn }: { txn: GroupedTransaction }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          className="flex cursor-pointer items-center gap-1 font-light decoration-current hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <Split className="text-muted-foreground h-3 w-3" />
          <span className="text-blue-500">View entries ({txn.entryCount})</span>
        </div>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split Transaction Entries</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-muted-foreground text-sm">
            <p>
              Date: {format(new Date(txn.date), 'dd MMM yyyy')} | Bank Amount:{' '}
              <FormattedAmount
                amount={txn.bankAmount}
                currency={txn.bankAccountCurrencyCode}
                accountingNegatives={false}
              />
            </p>
          </div>
          <div className="space-y-2">
            <div className="text-muted-foreground grid grid-cols-12 gap-2 border-b pb-2 text-xs font-medium">
              <div className="col-span-4">Account</div>
              <div className="col-span-2">Description</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-2 text-right">Contact</div>
              <div className="col-span-2 text-right">Project</div>
            </div>
            {txn.entries?.map((line, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 border-b pb-2 text-sm last:border-0 last:pb-0"
              >
                <div className="col-span-4">
                  <div className="font-medium">
                    {line.coaName || 'Uncategorized'}
                  </div>
                  {line.coaCode && (
                    <div className="text-muted-foreground text-xs">
                      {line.coaCode}
                    </div>
                  )}
                </div>
                <div className="text-muted-foreground col-span-2">
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
