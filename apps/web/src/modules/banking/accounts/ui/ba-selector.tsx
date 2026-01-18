import { useMemo, useState } from 'react';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { FormField } from '@/components/FormField';
import { useCompany } from '@/domains-pending-migration/company/store';
import { cn } from '@/lib/utils';
import { type BankAccountWithMeta } from '@/modules/banking/accounts';
import { useCompanyBankAccounts } from '@/modules/banking/accounts/model/hooks';
import { AddBankAccountDialog } from '@/modules/banking/accounts/ui/ba-add-dialog';
import { useIsMobile } from '@/shared/hooks/use-media-query';
import { maskDigits } from '@/shared/utils/formatting-utils';
import { Plus } from 'lucide-react';

export default function BankAccountSelector({
  value,
  onSelect,
  includeActionItem = true,
  groupBy,
  classNames,
}: //   prependItems = [],
{
  value?: string;
  onSelect?: (bankAccount: BankAccountWithMeta | null) => void;
  groupBy?: keyof BankAccountWithMeta;
  includeActionItem?: boolean;
  classNames?: { trigger?: string; overlay?: string };
  //   prependItems?: BankAccountWithMeta[];
}) {
  // States
  const [dialogOpen, setDialogOpen] = useState(false);

  // Hooks
  const { companyId } = useCompany();
  const {
    data: companyBankAccounts,
    refetch,
    isLoading,
    isError,
    error,
  } = useCompanyBankAccounts(companyId ?? '');
  const isMobile = useIsMobile();

  // Computed
  const bankAccounts: BankAccountWithMeta[] = useMemo(
    () => companyBankAccounts?.data || [],
    [companyBankAccounts],
  );
  //   const bankAccounts = useMemo(() => {
  //     return prependItems.length > 0
  //       ? [...prependItems, ...apiBankAccounts]
  //       : apiBankAccounts;
  //   }, [prependItems, apiBankAccounts]);

  const selectedBankAccount = useMemo(
    () => bankAccounts.find((acc) => acc.id === value) ?? null,
    [value, bankAccounts],
  );

  // Functions
  const onNewBankAccount = async (newAccount?: BankAccountWithMeta) => {
    try {
      await refetch();
      if (newAccount) {
        onSelect?.(newAccount);
      }
    } catch (error) {
      console.error('Failed to refresh bank accounts:', error);
    } finally {
      setDialogOpen(false);
    }
  };

  const handleValueChange = (id: string) => {
    const selectedAccount = bankAccounts.find((acc) => acc.id === id) ?? null;
    onSelect?.(selectedAccount);
  };

  const handleAction = (actionId: string) => {
    if (actionId === 'add-new') {
      setDialogOpen(true);
    }
  };

  if (isLoading) {
    return <CenteredLoader />;
  }

  if (isError) {
    return (
      <ErrorPage
        message={`Error loading bank accounts: ${error?.message || 'Unknown error'}`}
      />
    );
  }

  return (
    <>
      <FormField className="w-full flex-shrink-0 space-y-0">
        <AutocompleteDropdown
          id="bank-account"
          drawerTitle="Select Bank Account"
          items={bankAccounts}
          mapItem={(item) => ({
            value: item.id,
            label: `${item.displayName} ${maskDigits(item.accountNumber)} ${
              item.currencyCode ? '(' + item.currencyCode + ')' : ''
            }`,
          })}
          value={selectedBankAccount?.id || ''}
          onValueChange={handleValueChange}
          groupBy={groupBy ? (isMobile ? '' : groupBy) : undefined}
          actionItems={
            includeActionItem
              ? [
                  {
                    id: 'add-new',
                    label: 'Add New Bank Account',
                    icon: <Plus />,
                  },
                ]
              : []
          }
          onAction={(actionId) => {
            if (actionId === 'add-new') {
              setDialogOpen(true);
            }
          }}
          emptyStateMessage="No bank accounts found"
          placeholder="Select a bank account..."
          className={cn(classNames?.trigger)}
        />
      </FormField>

      <AddBankAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={onNewBankAccount}
        onCancel={() => setDialogOpen(false)}
        overlayClassName={classNames?.overlay ?? 'bg-black/85'}
      />
    </>
  );
}
