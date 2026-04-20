import type { BankAccountWithMeta } from '@/modules/banking/accounts';
import { Building } from 'lucide-react';

export function SelectedBankAccount({
  selectedBankAccount,
}: {
  selectedBankAccount: BankAccountWithMeta;
}) {
  return (
    <div className="flex-shrink-0">
      <div className="bg-muted px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <Building className="h-4 w-4 text-blue-600" />
            </div>

            <div>
              <p className="font-medium">{selectedBankAccount.bankName}</p>
              <p className="text-sm">{selectedBankAccount.displayName} </p>
            </div>
          </div>
          <div className="text-right">
            {/* <p className="text-sm">Balance</p>
            <p className="font-semibold">
              <FormattedAmount
                amount={selectedBankAccount.balance ?? 0}
                currency={selectedBankAccount.currencyCode}
                showSymbol={true}
                showCode
                codeClassName="text-muted-foreground text-xs"
              />
            </p> */}
            <p className="text-muted-foreground text-sm">Currency</p>
            <p className="font-semibold">{selectedBankAccount.currencyCode}</p>
          </div>
        </div>
      </div>
      <hr />
    </div>
  );
}
