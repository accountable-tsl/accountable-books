import {
  ArrowRight,
  Building2,
  Check,
  Dot,
  Landmark,
  Plus,
  User,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type {
  ConnectedAccount,
  ConnectAccountsResponse,
} from '@/modules/banking/connections';
import { cn } from '@/lib/utils';
import { StepHeader } from '@/features/connect-bank/ui/components/step-header';
import { toast } from 'sonner';
import {
  useMinimalBankAccountDetails,
  useUpdateBankAccounts,
  type BusinessOrPersonalAccount,
  type MinimalBankAccountDetails,
} from '@/modules/banking/accounts';

interface ClassifyAccountStepProps {
  stepWrapperClass: string;
  connectedAccounts: ConnectAccountsResponse;
  onComplete: () => void;
  onConnectAnother: () => void;
  companyId: string;
}

export function ClassifyAccountStep({
  stepWrapperClass,
  connectedAccounts,
  onComplete,
  onConnectAnother,
  companyId,
}: ClassifyAccountStepProps) {
  const updateBankAccountsMutation = useUpdateBankAccounts();

  // Start with bank connection data immediately (no loading delay)
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(
    connectedAccounts.accounts,
  );

  // Track what we know is saved in the database
  const [savedState, setSavedState] = useState<ConnectedAccount[]>(
    connectedAccounts.accounts,
  );

  // Fetch database state in background (non-blocking)
  const bankAccountIds = connectedAccounts.accounts.map((acc) => acc.id);
  const { data: databaseResponse, refetch: refetchDatabaseState } =
    useMinimalBankAccountDetails(companyId, bankAccountIds);

  // When database response arrives, update saved state and current accounts
  useEffect(() => {
    if (databaseResponse?.data) {
      const mergedAccounts = connectedAccounts.accounts.map((bankAccount) => {
        const dbAccount = databaseResponse.data!.find(
          (db: MinimalBankAccountDetails) => db.id === bankAccount.id,
        );
        const mergedAccount = {
          ...bankAccount,
          businessOrPersonal:
            dbAccount?.businessOrPersonal ?? bankAccount.businessOrPersonal,
        };
        return mergedAccount;
      });

      // Update both saved state and current accounts
      setSavedState(mergedAccounts);
      setAccounts(mergedAccounts);
    }
  }, [connectedAccounts.accounts, databaseResponse?.data]);

  // Calculate unsaved changes by comparing current vs saved state
  const hasUnsavedChanges = useMemo(() => {
    return accounts.some((account) => {
      const savedAccount = savedState.find((saved) => saved.id === account.id);
      return savedAccount?.businessOrPersonal !== account.businessOrPersonal;
    });
  }, [accounts, savedState]);

  // Prevent navigation away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        return 'You have unsaved account changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Sync with new accounts when connectedAccounts changes (if no unsaved changes)
  useEffect(() => {
    if (!hasUnsavedChanges) {
      // Refetch database state to get latest data for new connections
      refetchDatabaseState();
    }
  }, [connectedAccounts.accounts, hasUnsavedChanges, refetchDatabaseState]);

  const handleAccountTypeChange = useCallback(
    (accountId: string, newType: BusinessOrPersonalAccount) => {
      setAccounts((prevAccounts) =>
        prevAccounts.map((account) =>
          account.id === accountId
            ? { ...account, businessOrPersonal: newType }
            : account,
        ),
      );
    },
    [],
  );

  const handleUpdateAccounts = useCallback(() => {
    if (!companyId || !hasUnsavedChanges) return;

    // Send ALL current account states (simple and idempotent)
    const payload = accounts.map((account) => ({
      id: account.id,
      businessOrPersonal: account.businessOrPersonal,
    }));

    updateBankAccountsMutation.mutate(
      { companyId, data: payload },
      {
        onSuccess: () => {
          // Optimistic update: immediately update saved state to match current
          setSavedState([...accounts]);
          // Still refetch database in background for verification
          refetchDatabaseState();
          toast.success('Bank account(s) updated successfully');
        },
        onError: (error) => {
          // Save failure edge case: We deliberately keep the current UI state unchanged
          // so the user can retry. The savedState remains at its previous value, which
          // means hasUnsavedChanges will still be true and the "Update accounts" button
          // remains visible for retry. No optimistic rollback needed - just let user retry.
          console.error('Failed to save account classifications:', error);
          toast.error('Failed to update bank accounts');
        },
      },
    );
  }, [
    companyId,
    hasUnsavedChanges,
    accounts,
    updateBankAccountsMutation,
    refetchDatabaseState,
  ]);

  const handleDone = useCallback(() => {
    if (hasUnsavedChanges) return;
    onComplete();
  }, [hasUnsavedChanges, onComplete]);

  const bank = useMemo(() => connectedAccounts.bank, [connectedAccounts]);
  const businessAccounts = useMemo(
    () => accounts.filter((acc) => acc.businessOrPersonal === 'business'),
    [accounts],
  );

  const personalAccounts = useMemo(
    () => accounts.filter((acc) => acc.businessOrPersonal === 'personal'),
    [accounts],
  );

  return (
    <div className={cn(stepWrapperClass, 'w-full h-[490px]')}>
      <StepHeader
        Icon={Check}
        title="Mark your business accounts"
        description="Toggle on the accounts you use for business"
      />

      <div className="space-y-4">
        <div className="flex text-sm items-center gap-4 justify-between">
          <div className="flex items-center gap-1">
            <div className="w-8 h-8 overflow-hidden rounded-full bg-muted flex items-center justify-center border">
              {bank.logoUrl ? (
                <img
                  src={bank.logoUrl}
                  alt={bank.name}
                  className="w-8 h-8 object-contain"
                />
              ) : (
                <Landmark className="w-4 h-4" />
              )}
            </div>
            <div>{bank.name || 'Bank'}</div>
          </div>
          <div className="flex items-center text-muted-foreground">
            <span>{businessAccounts.length} business</span>
            <Dot className="size-4" />
            <span>{personalAccounts.length} personal</span>
          </div>
        </div>

        <div className="space-y-2">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">{acc.displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      ****{acc.mask}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm">
                      {acc.businessOrPersonal === 'business' ? (
                        <span className="text-green-700 flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          Business
                        </span>
                      ) : (
                        <span className="text-muted-foreground flex items-center gap-1">
                          <User className="w-3 h-3" />
                          Personal
                        </span>
                      )}
                    </div>
                    <Switch
                      checked={acc.businessOrPersonal === 'business'}
                      disabled={updateBankAccountsMutation.isPending}
                      className={cn(
                        updateBankAccountsMutation.isPending &&
                          'cursor-not-allowed opacity-70',
                      )}
                      onCheckedChange={(checked) =>
                        handleAccountTypeChange(
                          acc.id,
                          checked ? 'business' : 'personal',
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {personalAccounts.length > 0 && (
          <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
            <p className="text-sm text-orange-800">
              Personal accounts are excluded from business reports. Transfers
              between business and personal accounts appear as director
              transactions.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={onConnectAnother}
            disabled={hasUnsavedChanges || updateBankAccountsMutation.isPending}
          >
            <Plus className="w-4 h-4 mr-2" />
            Connect another account
          </Button>

          {hasUnsavedChanges ? (
            <Button
              className="w-full"
              onClick={handleUpdateAccounts}
              disabled={updateBankAccountsMutation.isPending}
            >
              Update accounts
            </Button>
          ) : (
            <Button
              className="w-full"
              size="lg"
              onClick={handleDone}
              disabled={updateBankAccountsMutation.isPending}
            >
              Done linking accounts
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
