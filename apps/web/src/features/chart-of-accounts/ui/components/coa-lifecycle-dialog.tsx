import type {
  CoaLifecyclePreflightResponse,
  CoaLifecycleResolution,
  CoaResponse,
} from '@/modules/accounting/chart-of-accounts';
import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ReferenceGroup = {
  key: string;
  sourceCoaId: string;
  type: CoaLifecycleResolution['referenceType'];
  label: string;
  referenceIds: string[];
  destructiveAction: 'void' | 'close' | 'disable';
};

export function CoaLifecycleDialog({
  open,
  preflight,
  accounts,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  preflight: CoaLifecyclePreflightResponse | null;
  accounts: CoaResponse[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: {
    resolutions: CoaLifecycleResolution[];
    acknowledgeUnresolvedArchiveReferences: boolean;
  }) => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [replacements, setReplacements] = useState<Record<string, string>>({});

  const groups = preflight ? referenceGroups(preflight) : [];
  const blocked = preflight?.accounts.some(
    (account) => account.blockers.length > 0,
  );
  const unresolved = groups.some((group) => !choices[group.key]);
  const missingReplacement = groups.some(
    (group) => choices[group.key] === 'replace' && !replacements[group.key],
  );
  const canConfirm =
    !!preflight &&
    !blocked &&
    !missingReplacement &&
    (preflight.operation === 'archive' || !unresolved);

  useEffect(() => {
    if (!open) {
      setChoices({});
      setReplacements({});
    }
  }, [open]);

  if (!preflight) return null;

  const sourceIds = new Set(preflight.accounts.map((account) => account.id));
  const replacementAccounts = accounts.filter(
    (account) =>
      account.isActive && !account.isDeleted && !sourceIds.has(account.id),
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {preflight.operation === 'archive' ? 'Archive' : 'Delete'} chart of
            accounts
          </AlertDialogTitle>
          <AlertDialogDescription>
            Review active references before continuing. Posted accounting
            history will never be modified.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {preflight.accounts.map((account) => (
            <section key={account.id} className="rounded-lg border p-4">
              <h3 className="font-medium">{account.name}</h3>
              {account.blockers.length > 0 && (
                <p className="text-destructive mt-2 text-sm">
                  Cannot continue: {account.blockers.join(', ')}
                </p>
              )}
              <ReferenceSummary account={account} />
            </section>
          ))}

          {groups.map((group) => (
            <section key={group.key} className="rounded-lg border p-4">
              <p className="text-sm font-medium">
                {group.referenceIds.length} {group.label}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Select
                  value={choices[group.key]}
                  onValueChange={(value) =>
                    setChoices((current) => ({
                      ...current,
                      [group.key]: value,
                    }))
                  }
                >
                  <SelectTrigger className="min-w-44">
                    <SelectValue placeholder="Choose resolution" />
                  </SelectTrigger>
                  <SelectContent>
                    {preflight.operation === 'archive' && (
                      <SelectItem value="keep">Keep references</SelectItem>
                    )}
                    <SelectItem value="replace">Replace account</SelectItem>
                    <SelectItem value={group.destructiveAction}>
                      {destructiveLabel(group.destructiveAction)}
                    </SelectItem>
                  </SelectContent>
                </Select>

                {choices[group.key] === 'replace' && (
                  <Select
                    value={replacements[group.key]}
                    onValueChange={(value) =>
                      setReplacements((current) => ({
                        ...current,
                        [group.key]: value,
                      }))
                    }
                  >
                    <SelectTrigger className="min-w-56">
                      <SelectValue placeholder="Replacement account" />
                    </SelectTrigger>
                    <SelectContent>
                      {replacementAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </section>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm || pending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm({
                resolutions: buildResolutions(groups, choices, replacements),
                acknowledgeUnresolvedArchiveReferences:
                  preflight.operation === 'archive' &&
                  groups.some((group) => choices[group.key] === 'keep'),
              });
            }}
          >
            {pending ? 'Applying...' : 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReferenceSummary({
  account,
}: {
  account: CoaLifecyclePreflightResponse['accounts'][number];
}) {
  const items = [
    ['bank accounts', account.references.bankAccounts.length],
    ['ledger entries', account.references.ledgerEntries.count],
    ['draft journals', account.references.draftJournals.length],
    ['recurring templates', account.references.recurringTemplates.length],
    ['categorization rules', account.references.categorizationRules.length],
    ['predictions', account.references.predictions.count],
    ['candidates', account.references.candidates.count],
  ].filter(([, count]) => Number(count) > 0);

  return items.length > 0 ? (
    <p className="text-muted-foreground mt-2 text-sm">
      {items.map(([label, count]) => `${count} ${label}`).join(' | ')}
    </p>
  ) : (
    <p className="text-muted-foreground mt-2 text-sm">No active references.</p>
  );
}

function referenceGroups(
  preflight: CoaLifecyclePreflightResponse,
): ReferenceGroup[] {
  return preflight.accounts.flatMap((account) => {
    const groups: ReferenceGroup[] = [];
    if (account.references.draftJournals.length > 0) {
      groups.push({
        key: `${account.id}:draft_journal`,
        sourceCoaId: account.id,
        type: 'draft_journal',
        label: 'draft journals',
        referenceIds: account.references.draftJournals.map(({ id }) => id),
        destructiveAction: 'void',
      });
    }
    if (account.references.recurringTemplates.length > 0) {
      groups.push({
        key: `${account.id}:recurring_template`,
        sourceCoaId: account.id,
        type: 'recurring_template',
        label: 'recurring templates',
        referenceIds: account.references.recurringTemplates.map(({ id }) => id),
        destructiveAction: 'close',
      });
    }
    const resolvableRules = account.references.categorizationRules.filter(
      (reference) => reference.resolvable !== false,
    );
    if (resolvableRules.length > 0) {
      groups.push({
        key: `${account.id}:categorization_rule`,
        sourceCoaId: account.id,
        type: 'categorization_rule',
        label: 'categorization rules',
        referenceIds: resolvableRules.map(({ id }) => id),
        destructiveAction: 'disable',
      });
    }
    return groups;
  });
}

function buildResolutions(
  groups: ReferenceGroup[],
  choices: Record<string, string>,
  replacements: Record<string, string>,
): CoaLifecycleResolution[] {
  return groups.flatMap((group) => {
    const action = choices[group.key];
    if (!action || action === 'keep') return [];
    return [
      {
        referenceType: group.type,
        sourceCoaId: group.sourceCoaId,
        referenceIds: group.referenceIds,
        action,
        ...(action === 'replace'
          ? { replacementCoaId: replacements[group.key] }
          : {}),
      } as CoaLifecycleResolution,
    ];
  });
}

function destructiveLabel(action: ReferenceGroup['destructiveAction']): string {
  if (action === 'void') return 'Void complete drafts';
  if (action === 'close') return 'Close templates';
  return 'Disable rules';
}
