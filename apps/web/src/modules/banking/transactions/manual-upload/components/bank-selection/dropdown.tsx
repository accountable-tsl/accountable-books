import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { FormField } from '@/components/FormField';
import { AddBankAccountDialog } from '@/modules/banking/accounts/ui/ba-add-dialog';
import type { BankAccountWithMeta } from '@/modules/banking/accounts';
import { maskDigits } from '@/shared/utils/formatting-utils';
import { Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export function BankDropdown({
  bankAccounts,
  selectedBankAccount,
  setSelectedBankAccount,
  onSuccess,
}: {
  bankAccounts: BankAccountWithMeta[] | null;
  selectedBankAccount: BankAccountWithMeta | null;
  setSelectedBankAccount: React.Dispatch<React.SetStateAction<BankAccountWithMeta | null>>;
  onSuccess?: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const mappedItems = useMemo(() => {
    if (!bankAccounts) return undefined;
    return (item: BankAccountWithMeta) => ({
      value: item.id,
      label: `${item.displayName} ${maskDigits(item.accountNumber)} (${item.currencyCode})`,
    });
  }, [bankAccounts]);

  const bankAccountMap = useMemo(() => {
    const map = new Map<string, BankAccountWithMeta>();
    bankAccounts?.forEach((acc) => map.set(acc.id, acc));
    return map;
  }, [bankAccounts, onSuccess]);

  const handleValueChange = useCallback(
    (id: string) => {
      const found = bankAccountMap.get(id) ?? null;
      setSelectedBankAccount(found);
    },
    [bankAccounts, setSelectedBankAccount],
  );

  return (
    <>
      <FormField className="w-full space-y-0 flex-shrink-0">
        <AutocompleteDropdown
          id="bank-account"
          drawerTitle="Select Bank Account"
          items={bankAccounts || []}
          mapItem={mappedItems}
          value={selectedBankAccount?.id || ''}
          onValueChange={handleValueChange}
          groupBy={bankAccounts && bankAccounts?.length > 5 ? 'bankName' : ''}
          actionItems={[
            {
              id: 'add-new',
              label: 'Add New Bank Account',
              icon: <Plus />,
            },
          ]}
          onAction={(actionId) => {
            if (actionId === 'add-new') {
              setDialogOpen(true);
            }
          }}
          emptyStateMessage="No bank accounts found"
          placeholder="Select a bank account..."
          className="rounded-none border-none"
        />
      </FormField>

      <AddBankAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={onSuccess}
        onCancel={() => setDialogOpen(false)}
        overlayClassName="bg-black/85"
      />
    </>
  );
}
