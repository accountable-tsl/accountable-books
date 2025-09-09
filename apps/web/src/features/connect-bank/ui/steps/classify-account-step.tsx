import { ArrowRight, Building2, Check, Dot, Landmark, Plus, User } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useState, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type {
  ConnectedAccount,
  ConnectAccountsResponse,
} from '@/modules/banking/connections/model/types';
import { cn } from '@/lib/utils';
import { useUpdateBankAccounts, type BusinessOrPersonalAccount } from '@/modules/banking/accounts';
import { StepHeader } from '@/features/connect-bank/ui/components/step-header';

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
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(connectedAccounts.accounts);
  const updateBankAccountsMutation = useUpdateBankAccounts();

  // Baseline originally personal accounts from initial payload
  const originallyPersonalIds = useMemo(() => {
    return new Set(
      connectedAccounts.accounts
        .filter((a) => a.businessOrPersonal === 'personal')
        .map((a) => a.id),
    );
  }, [connectedAccounts.accounts]);

  // Mutable baseline that we extend after successful update
  const baselinePersonalIdsRef = useRef<Set<string>>(originallyPersonalIds);

  // Track IDs newly changed to personal (excluding baseline)
  const [changedToPersonalIds, setChangedToPersonalIds] = useState<Set<string>>(new Set());

  const handleAccountTypeChange = useCallback(
    (accountId: string, newType: BusinessOrPersonalAccount) => {
      setAccounts((prevAccounts) => {
        const updated = prevAccounts.map((account) =>
          account.id === accountId ? { ...account, businessOrPersonal: newType } : account,
        );

        return updated;
      });

      setChangedToPersonalIds((prev) => {
        const next = new Set(prev);
        const isInBaseline = baselinePersonalIdsRef.current.has(accountId);
        if (newType === 'personal' && !isInBaseline) {
          next.add(accountId);
        } else {
          next.delete(accountId);
        }
        return next;
      });
    },
    [],
  );

  const handleUpdateAccounts = useCallback(() => {
    if (!companyId || changedToPersonalIds.size === 0) return;
    const payload = Array.from(changedToPersonalIds).map((id) => ({
      id,
      businessOrPersonal: 'personal' as const,
    }));
    updateBankAccountsMutation.mutate(
      { companyId, data: payload },
      {
        onSuccess: () => {
          // Merge into baseline and clear changes
          const merged = new Set(baselinePersonalIdsRef.current);
          changedToPersonalIds.forEach((id) => merged.add(id));
          baselinePersonalIdsRef.current = merged;
          setChangedToPersonalIds(new Set());
        },
      },
    );
  }, [changedToPersonalIds, companyId, updateBankAccountsMutation]);

  const handleDone = useCallback(() => {
    if (changedToPersonalIds.size > 0) return;
    onComplete();
  }, [changedToPersonalIds, onComplete]);

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
                <img src={bank.logoUrl} alt={bank.name} className="w-8 h-8 object-contain" />
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
                    <div className="text-xs text-muted-foreground">****{acc.mask}</div>
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
                      // disabled={updateClassificationMutation.isPending}
                      onCheckedChange={(checked) =>
                        handleAccountTypeChange(acc.id, checked ? 'business' : 'personal')
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
              Personal accounts are excluded from business reports. Transfers between business and
              personal accounts appear as director transactions.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={onConnectAnother}
            disabled={changedToPersonalIds.size > 0 || updateBankAccountsMutation.isPending}
          >
            <Plus className="w-4 h-4 mr-2" />
            Connect another account
          </Button>

          {changedToPersonalIds.size > 0 ? (
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
