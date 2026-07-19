import type {
  BusinessOrPersonalAccount,
  MinimalBankAccountDetails,
} from '@/modules/banking/accounts';
import type {
  ConnectAccountsResponse,
  ConnectedAccount,
} from '@/modules/banking/connections';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { StepHeader } from '@/features/connect-bank/ui/components/step-header';
import { cn } from '@/lib/utils';
import {
  useMinimalBankAccountDetails,
  useUpdateBankAccounts,
} from '@/modules/banking/accounts';
import {
  ArrowRight,
  Building2,
  Check,
  Dot,
  Landmark,
  Plus,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

const FETCHING_COPY =
  "We're fetching your recent transactions. They'll show up shortly.";
const REFRESHING_COPY =
  "We're refreshing recent activity. Updates will show up shortly.";

interface ClassifyAccountStepProps {
  stepWrapperClass: string;
  connectedAccounts: ConnectAccountsResponse;
  onComplete: () => void;
  onConnectAnother: () => void;
  companyId: string;
  /** When false (individuals), show linked accounts without business/personal toggles. */
  showClassification?: boolean;
}

export function ClassifyAccountStep({
  stepWrapperClass,
  connectedAccounts,
  onComplete,
  onConnectAnother,
  companyId,
  showClassification = true,
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
    if (!showClassification || !databaseResponse?.data) return;

    const mergedAccounts = connectedAccounts.accounts.map((bankAccount) => {
      const dbAccount = databaseResponse.data!.find(
        (db: MinimalBankAccountDetails) => db.id === bankAccount.id,
      );
      return {
        ...bankAccount,
        businessOrPersonal:
          dbAccount?.businessOrPersonal ?? bankAccount.businessOrPersonal,
      };
    });

    setSavedState(mergedAccounts);
    setAccounts(mergedAccounts);
  }, [connectedAccounts.accounts, databaseResponse?.data, showClassification]);

  const hasUnsavedChanges = useMemo(() => {
    if (!showClassification) return false;
    return accounts.some((account) => {
      const savedAccount = savedState.find((saved) => saved.id === account.id);
      return savedAccount?.businessOrPersonal !== account.businessOrPersonal;
    });
  }, [accounts, savedState, showClassification]);

  useEffect(() => {
    if (!showClassification) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        return 'You have unsaved account changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, showClassification]);

  useEffect(() => {
    if (!showClassification || hasUnsavedChanges) return;
    refetchDatabaseState();
  }, [
    connectedAccounts.accounts,
    hasUnsavedChanges,
    refetchDatabaseState,
    showClassification,
  ]);

  useEffect(() => {
    if (hasUnsavedChanges) return;
    setAccounts(connectedAccounts.accounts);
    setSavedState(connectedAccounts.accounts);
  }, [connectedAccounts.accounts, hasUnsavedChanges]);

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

    const payload = accounts.map((account) => ({
      id: account.id,
      businessOrPersonal: account.businessOrPersonal,
    }));

    updateBankAccountsMutation.mutate(
      { companyId, data: payload },
      {
        onSuccess: () => {
          setSavedState([...accounts]);
          refetchDatabaseState();
          toast.success('Bank account(s) updated successfully');
        },
        onError: (error) => {
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

  const newAccountCount = useMemo(
    () => accounts.filter((acc) => acc.linkage === 'new').length,
    [accounts],
  );
  const existingAccountCount = accounts.length - newAccountCount;

  const statusCopy =
    newAccountCount === 0
      ? REFRESHING_COPY
      : existingAccountCount === 0
        ? FETCHING_COPY
        : `We're fetching new accounts and refreshing existing ones. Updates will show up shortly.`;

  const headerTitle = showClassification
    ? 'Mark your business accounts'
    : existingAccountCount > 0 && newAccountCount === 0
      ? 'Connection updated'
      : "You're connected";
  const headerDescription = showClassification
    ? `Toggle on the accounts you use for business. ${statusCopy}`
    : statusCopy;

  return (
    <div className={cn(stepWrapperClass, 'h-[490px] w-full')}>
      <StepHeader
        Icon={Check}
        title={headerTitle}
        description={headerDescription}
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-1">
            <div className="bg-muted flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border">
              {bank.logoUrl ? (
                <img
                  src={bank.logoUrl}
                  alt={bank.name}
                  className="h-8 w-8 object-contain"
                />
              ) : (
                <Landmark className="h-4 w-4" />
              )}
            </div>
            <div>{bank.name || 'Bank'}</div>
          </div>
          <div className="text-muted-foreground flex items-center">
            {showClassification ? (
              <>
                <span>{businessAccounts.length} business</span>
                <Dot className="size-4" />
                <span>{personalAccounts.length} personal</span>
              </>
            ) : (
              <span>
                {accounts.length} account{accounts.length === 1 ? '' : 's'}{' '}
                linked
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className={cn(
                'bg-card hover:bg-accent/50 flex items-center justify-between rounded-lg border p-3 transition-colors',
                acc.linkage === 'new' && 'border-foreground/25',
              )}
            >
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm">{acc.displayName}</div>
                      <span
                        className={cn(
                          'text-muted-foreground text-[11px]',
                          acc.linkage === 'new' && 'text-foreground/80',
                        )}
                      >
                        {acc.linkage === 'new' ? 'New' : 'Already linked'}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      ****{acc.mask}
                    </div>
                  </div>
                  {showClassification ? (
                    <div className="flex items-center gap-3">
                      <div className="text-sm">
                        {acc.businessOrPersonal === 'business' ? (
                          <span className="flex items-center gap-1 text-green-700">
                            <Building2 className="h-3 w-3" />
                            Business
                          </span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
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
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        {showClassification && personalAccounts.length > 0 && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
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
            <Plus className="mr-2 h-4 w-4" />
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
              {showClassification ? 'Done linking accounts' : 'Continue'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
