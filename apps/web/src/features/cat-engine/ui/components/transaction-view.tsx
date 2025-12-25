import { FormattedAmount } from '@/components/FormattedAmount';
import { TooltipHelper } from '@/components/TooltipHelper';
import { cn } from '@/lib/utils';
import type {
  CategorizationTransactionFile,
  GroupedTransaction,
} from '@/modules/accounting/categorization';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Landmark,
  Pencil,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { TOOLTIPS } from '../constants';
import { Badge } from '@/components/ui/badge';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import type { GroupedCoaData } from '../types';
import { useSession } from '@/app/session';
import { useContactsInfinite, type ContactResponse } from '@/modules/contacts';
import { useProjectsInfinite, type ProjectsResponse } from '@/modules/projects';
import { AddContactDialog } from '@/features/manage-contacts/ui/components/contacts-add';
import { AddProjectDialog } from '@/features/manage-projects/ui/components/projects-add';
import { AddNewCoaDialog } from '@/features/chart-of-accounts/ui/components/coa-add-new';
import { useLedgerIntentUpdater } from '../hooks/use-intent-emitter';
import type {
  LedgerIntent,
  LedgerIntentDesiredState,
  LedgerIntentEntry,
} from '@accountable-books/contracts/schema';
import { Button } from '@/components/ui/button';
import { FilePreviewer } from '@/components/file-previewer';
import { formatAmount } from '@/shared/utils/formatting-utils';
import { compareDeep } from '@/shared/utils/comparison-utils';

// Escape key should close the edit mode and act as cancel
// Enter key should save the entry and act as save
// If unsaved changes and user tries to navigate away, show an alert or something to make sure they want to leave and discard the changes

interface TransactionViewProps {
  transaction: GroupedTransaction;
  groupedCoaData?: GroupedCoaData[];
}

type EntryField = keyof LedgerIntentEntry;
type TxnLevelField = Omit<keyof LedgerIntentDesiredState, 'entries'>;

export function TransactionView({
  transaction: txn,
  groupedCoaData = [],
}: TransactionViewProps) {
  const { companyId } = useSession();
  const { updateEntry, updateExchangeRate } = useLedgerIntentUpdater(txn);

  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    new Set(),
  );
  const [editing, setEditing] = useState<{
    entryId: string;
    field: EntryField | TxnLevelField;
  } | null>(null);
  const [contactSearch, setContactSearch] = useState<string>('');
  const [projectSearch, setProjectSearch] = useState<string>('');
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [coaDialogOpen, setCoaDialogOpen] = useState(false);
  const [draftTransactionState, setDraftTransactionState] = useState<
    LedgerIntentDesiredState | undefined
  >(undefined);
  // Store both server files (CategorizationTransactionFile) and newly uploaded files (File)
  const [draftEntryFiles, setDraftEntryFiles] = useState<
    Map<string, (CategorizationTransactionFile | File)[]>
  >(new Map());
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(
    null,
  );
  const [isEditingAmount, setIsEditingAmount] = useState(false);

  const contactsQuery = useContactsInfinite({
    companyId: companyId || '',
    limit: 30,
    search: contactSearch || undefined,
  });

  const projectsQuery = useProjectsInfinite({
    companyId: companyId || '',
    limit: 30,
    search: projectSearch || undefined,
  });

  // Convert contacts to items format
  const contactItems = useMemo(() => {
    if (!contactsQuery.data?.pages) return [];

    return contactsQuery.data.pages.flatMap((page) => {
      if (!page.data) return [];
      const response = page.data as ContactResponse;
      return (response.contacts || [])
        .filter((contact) => contact.id)
        .map((contact) => ({
          label: contact.displayName,
          value: contact.id,
        }));
    });
  }, [contactsQuery.data?.pages]);

  // Convert projects to items format
  const projectItems = useMemo(() => {
    if (!projectsQuery.data?.pages) return [];

    return projectsQuery.data.pages.flatMap((page) => {
      if (!page.data) return [];
      const response = page.data as ProjectsResponse;
      return (response.projects || [])
        .filter((project) => project.id)
        .map((project) => ({
          label: project.name,
          value: project.id!,
        }));
    });
  }, [projectsQuery.data?.pages]);

  const intent = useMemo(() => {
    return {
      // intent_id: uuidv4(),
      bank_transaction_id: txn.id,
      desired_state: draftTransactionState,
    };
  }, [draftTransactionState, txn.id]);

  useEffect(() => {
    if (!txn) return;

    const initialEntries: LedgerIntentEntry[] = (txn.entries || []).map(
      (entry) => ({
        entry_id: entry.id,
        fs_date: entry.fsDate || entry.date,
        description: entry.description,
        reference: entry.reference,
        contact_id: entry.contactId,
        project_id: entry.projectId,
        source_amount: entry.nativeAmount,
        coa_id: entry.coaId || '',
      }),
    );

    setDraftTransactionState({
      custom_exchange_rate: parseFloat(txn.exchangeRate.toString()),
      entries: initialEntries,
    });

    // Files by entry id
    const filesByEntryId = new Map<string, CategorizationTransactionFile[]>();
    txn.entries?.forEach((entry) => {
      if (!entry.id) return;
      filesByEntryId.set(entry.id, entry.files || []);
    });
    setDraftEntryFiles(filesByEntryId);
  }, [txn.id]); // Only reset when the transaction ID changes

  const toggleEntry = (entryId: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedEntries(newExpanded);
  };

  function getDraftEntry(entryId: string) {
    return draftTransactionState?.entries?.find((e) => e.entry_id === entryId);
  }
  function updateDraftEntry(
    entryId: string,
    patch: Partial<LedgerIntentEntry>,
  ) {
    setDraftTransactionState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: prev.entries?.map((e) =>
          e.entry_id === entryId ? { ...e, ...patch } : e,
        ),
      };
    });
  }

  function updateTxnLevelDraft(
    patch: Partial<Omit<LedgerIntentDesiredState, 'entries'>>,
  ) {
    setDraftTransactionState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ...patch,
      };
    });
  }

  function resetDraftEntryFromTxn(entryId: string) {
    const serverEntry = txn.entries?.find((e) => e.id === entryId);
    if (!serverEntry) return;

    updateDraftEntry(entryId, {
      coa_id: serverEntry.coaId ?? '',
      contact_id: serverEntry.contactId,
      project_id: serverEntry.projectId,
      description: serverEntry.description,
      reference: serverEntry.reference,
    });
  }

  function hasEntryChanged(entryId: string): boolean {
    const draft = getDraftEntry(entryId);
    const server = txn.entries?.find((e) => e.id === entryId);

    if (!draft || !server) return false;

    return (
      draft.coa_id !== (server.coaId ?? '') ||
      draft.contact_id !== server.contactId ||
      draft.project_id !== server.projectId ||
      draft.description !== server.description ||
      draft.reference !== server.reference ||
      draft.source_amount !== server.nativeAmount
    );
  }

  function canPersistEntry(entryId: string): boolean {
    const entry = getDraftEntry(entryId);
    if (!entry) return false;

    // 0. Nothing changed → nothing to do
    if (!hasEntryChanged(entryId)) return false;

    // 1. Entry must be categorizable
    if (!entry.coa_id) return false;

    // 2. Transaction must be balanced
    if (!isTransactionBalanced()) return false;

    return true;
  }

  function isTransactionBalanced(): boolean {
    if (!draftTransactionState?.entries?.length) return false;

    const entriesTotal = draftTransactionState.entries.reduce(
      (sum, e) => sum + (e.source_amount ?? 0),
      0,
    );

    return Math.abs(entriesTotal + txn.bankAmount) < 0.0001;
  }

  const handleSaveEntry = (entryId: string, field: EntryField, value: any) => {
    if (canPersistEntry(entryId)) {
      setTimeout(() => {
        updateEntry(entryId, { [field]: value });
      }, 300);
    }

    setEditing(null);
  };

  const handleCancelEntry = (entryId: string) => {
    resetDraftEntryFromTxn(entryId);
    setEditing(null);
  };

  const handleAddEntry = () => {
    if (!draftTransactionState) return;

    const newEntryId = `temp-entry-${(draftTransactionState.entries?.length || 0) + 1}`;
    const newEntry: LedgerIntentEntry = {
      entry_id: newEntryId,
      coa_id: '' as any,
      fs_date: txn.date,
      description: null,
      reference: null,
      contact_id: null,
      project_id: null,
      source_amount: 0,
    };

    setDraftTransactionState({
      ...draftTransactionState,
      entries: [...(draftTransactionState.entries || []), newEntry],
    });

    // Initialize empty files array for the new entry
    setDraftEntryFiles((prev) => {
      const newFilesMap = new Map(prev);
      newFilesMap.set(newEntryId, []);
      return newFilesMap;
    });
  };

  const handleDeleteEntry = (entryId: string) => {
    if (!draftTransactionState?.entries) return;

    setDraftTransactionState({
      ...draftTransactionState,
      entries: draftTransactionState.entries.filter(
        (e) => e.entry_id !== entryId,
      ),
    });

    // Remove files for the deleted entry
    setDraftEntryFiles((prev) => {
      const newFilesMap = new Map(prev);
      newFilesMap.delete(entryId);
      return newFilesMap;
    });
  };

  const handleFileUpload = (
    entryId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setDraftEntryFiles((prev) => {
        const newFilesMap = new Map(prev);
        const existingFiles = newFilesMap.get(entryId) || [];
        newFilesMap.set(entryId, [...existingFiles, ...newFiles]);
        return newFilesMap;
      });
    }
    // Reset the input so the same file can be selected again
    e.target.value = '';
  };

  const removeFile = (entryId: string, fileIndex: number) => {
    setDraftEntryFiles((prev) => {
      const newFilesMap = new Map(prev);
      const existingFiles = newFilesMap.get(entryId) || [];
      const updatedFiles = existingFiles.filter(
        (_, index) => index !== fileIndex,
      );
      if (updatedFiles.length === 0) {
        newFilesMap.delete(entryId);
      } else {
        newFilesMap.set(entryId, updatedFiles);
      }
      return newFilesMap;
    });
  };

  const isFxTransaction =
    txn?.bankAccountCurrencyCode !== txn?.reportingCurrencyCode;

  if (!txn) {
    return null;
  }

  return (
    <div
      className={cn(
        'min-h-0 h-full text-sm rounded-md flex flex-col gap-4 border overflow-hidden',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between px-4 py-1 h-10 min-h-10 border-b',
          //   backgroundClass,
        )}
      >
        <div>Transaction Details</div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {txn.status === 'proposed' ? 'auto-categorized' : txn.status}
          </Badge>
        </div>
      </div>

      <div className="divide-y flex-1 flex flex-col min-h-0">
        <div className="grid grid-cols-2 gap-4 p-4 pt-0 items-center flex-shrink-0">
          {/* Amount */}
          <div className="overflow-hidden">
            <div className="text-xs text-muted-foreground truncate">
              Bank amount
            </div>
            <FormattedAmount
              amount={txn.nativeAmount}
              currency={txn.bankAccountCurrencyCode}
              showSymbol
              accountingNegatives={false}
              className={cn(
                'text-xl font-bold truncate',
                txn.nativeAmount > 9_999_999_999 ? 'text-lg' : '',
                txn.nativeAmount < 0
                  ? 'text-red-600 dark:text-red-500'
                  : txn.nativeAmount > 0
                    ? 'text-green-700 dark:text-green-500'
                    : '',
              )}
            />
          </div>

          {/* Bank Logo */}
          <TooltipHelper
            icon={false}
            content={
              `${txn.bankName} - ${txn.bankAccountName}` || TOOLTIPS.BANK_LOGO
            }
            contentStyle="w-fit max-w-xs text-center"
            trigger={
              <div className="flex gap-2 items-center overflow-hidden">
                <div
                  className="flex-shrink-0 w-8 h-8 overflow-hidden rounded-full bg-muted dark:bg-foreground/70 flex items-center justify-center border"
                  role="img"
                  aria-label={`${txn.bankName || TOOLTIPS.BANK_LOGO} logo`}
                >
                  {txn.bankLogo ? (
                    <img
                      src={txn.bankLogo}
                      alt={`${txn.bankName || 'Bank'} Logo`}
                      className="w-8 h-8 object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <Landmark className="w-4 h-4" />
                  )}
                </div>
                <p className="text-muted-foreground text-xs line-clamp-2">
                  {txn.bankAccountName}
                </p>
              </div>
            }
          />

          {/* Exchange Rate */}
          <div>
            <p className="text-xs text-muted-foreground">Exchange Rate</p>
            <p className="">
              {draftTransactionState?.custom_exchange_rate ?? txn.exchangeRate}
            </p>
          </div>

          {/* Bank Transaction Date */}
          <div>
            <TooltipHelper
              icon={false}
              content="Bank Transaction Date"
              trigger={<p className="text-muted-foreground text-xs">Date</p>}
            />
            <p>{txn.date}</p>
          </div>

          {/* Bank Description */}
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Description</p>
            <TooltipHelper
              icon={false}
              content={txn.description || ''}
              trigger={<p className="truncate">{txn.description}</p>}
            />
          </div>
          {!txn.hasMultipleEntries && (
            <>
              {/* Contact */}
              <div>
                <p className="text-xs text-muted-foreground">Contact</p>
                <p>{txn.contactName}</p>
              </div>

              {/* Reference */}
              <div>
                <p className="text-xs text-muted-foreground">Reference</p>
                <p>{txn.reference || '-'}</p>
              </div>
            </>
          )}
        </div>

        {/* Entries Section */}
        <div className="p-4 flex-1 overflow-y-auto scrollbar-thin-2px min-h-0">
          {/* Exchange Rate - Editable */}
          {isFxTransaction && (
            <div className="space-y-1 mb-4">
              <NumberField
                label={`Exchange Rate (1 ${txn.bankAccountCurrencyCode} = ?${' '}
                ${txn.reportingCurrencyCode})`}
                amount={draftTransactionState?.custom_exchange_rate || 1}
                step={0.0001}
                isEditing={editing?.entryId === 'exchange_rate'}
                onEdit={() =>
                  setEditing({
                    entryId: 'exchange_rate',
                    field: 'custom_exchange_rate',
                  })
                }
                onDraftChange={(v) => {
                  updateTxnLevelDraft({ custom_exchange_rate: v });
                }}
                onCommit={() => {
                  // Simple check: if rate changed and is valid, save it
                  const originalRate = parseFloat(txn.exchangeRate.toString());
                  const newRate = draftTransactionState?.custom_exchange_rate;
                  if (
                    newRate &&
                    newRate > 0 &&
                    Math.abs(originalRate - newRate) > 0.000001
                  ) {
                    updateExchangeRate(newRate);
                  }
                  setEditing(null);
                }}
                onCancel={() => {
                  setDraftTransactionState(
                    (prev) =>
                      prev && {
                        ...prev,
                        custom_exchange_rate: Number(txn.exchangeRate || 1),
                      },
                  );
                  setEditing(null);
                }}
                inputOnly={false}
                decimalPlaces={6}
              />
              <div className="text-xs text-muted-foreground">
                Affects all entries in this transaction
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground">Entries</div>

          <div className="space-y-3">
            {/* Bank Leg Entry */}
            <div className="p-1 border-2 rounded overflow-clip">
              {/* Entry Header */}
              <div className="px-2 py-1 bg-muted rounded overflow-clip">
                <div className="flex justify-between overflow-clip gap-4">
                  <div className="flex min-w-0 items-center gap-1 overflow-clip">
                    <span className="flex-shrink-0 text-xs text-muted-foreground">
                      {txn.bankAmount < 0 ? 'CR' : 'DR'}
                    </span>
                    <div
                      className="text-sm truncate"
                      title={txn.bankAccountCoaName ?? txn.bankAccountName}
                    >
                      {txn.bankAccountCoaName ?? txn.bankAccountName}
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      (Bank Leg)
                    </span>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <div
                      className={cn(
                        txn.bankAmount < 0
                          ? 'text-red-600 dark:text-red-500'
                          : txn.bankAmount > 0
                            ? 'text-green-700 dark:text-green-500'
                            : '',
                      )}
                    >
                      <span className="mr-0.5">
                        {txn.bankAmount < 0 ? '-' : '+'}
                      </span>
                      <FormattedAmount
                        amount={Math.abs(txn.bankAmount)}
                        currency={txn.bankAccountCurrencyCode}
                        showSymbol
                        accountingNegatives={false}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {draftTransactionState?.entries?.map((draftEntry) => {
              // const draftEntry = getDraftEntry(entry?.id);
              // if (!draftEntry) return null;

              const serverEntry = txn.entries?.find(
                (e) => e.id === draftEntry.entry_id,
              );

              const sourceAmt = draftEntry.source_amount ?? 0;
              const debitValue = sourceAmt > 0 ? sourceAmt : '';
              const creditValue = sourceAmt < 0 ? Math.abs(sourceAmt) : '';

              return (
                <div
                  key={draftEntry.entry_id}
                  className="border rounded overflow-hidden"
                >
                  <div className="px-3 py-2 bg-muted hover:bg-muted/50 transition-colors">
                    {/* Entry Header */}
                    <div
                      onClick={() => toggleEntry(draftEntry.entry_id || '')}
                      className="flex items-center justify-between overflow-clip gap-4 cursor-pointer"
                    >
                      <div className="flex min-w-0 items-center gap-1 overflow-clip">
                        <span className="flex-shrink-0 text-xs text-muted-foreground">
                          {sourceAmt < 0 ? 'CR' : 'DR'}
                        </span>
                        <span className="text-sm truncate">
                          {groupedCoaData
                            .flatMap((group) => group.items)
                            .find((item) => item.value === draftEntry.coa_id)
                            ?.label ?? 'Not set'}
                        </span>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <div
                          className={cn(
                            sourceAmt < 0
                              ? 'text-red-600 dark:text-red-500'
                              : sourceAmt > 0
                                ? 'text-green-700 dark:text-green-500'
                                : '',
                          )}
                        >
                          <span className="mr-0.5">
                            {sourceAmt < 0 ? '-' : '+'}
                          </span>
                          <FormattedAmount
                            amount={Math.abs(sourceAmt)}
                            currency={txn.bankAccountCurrencyCode}
                            showSymbol
                            accountingNegatives={false}
                          />
                        </div>
                        {expandedEntries.has(draftEntry.entry_id || '') ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Entry Details - Expanded */}
                  {expandedEntries.has(draftEntry.entry_id || '') && (
                    <div className="px-3 py-3 space-y-3 border">
                      {/* Account */}
                      <EditableSelectField
                        label="Account"
                        confidence={
                          serverEntry?.status === 'proposed' &&
                          serverEntry?.confidence
                            ? serverEntry.confidence
                            : undefined
                        }
                        value={draftEntry?.coa_id ?? ''}
                        isEditing={
                          editing?.entryId === draftEntry.entry_id &&
                          editing?.field === 'coa_id'
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: draftEntry.entry_id || '',
                            field: 'coa_id',
                          })
                        }
                        onValueChange={(value) => {
                          updateDraftEntry(draftEntry.entry_id || '', {
                            coa_id: value,
                          });
                        }}
                        onSave={() => {
                          handleSaveEntry(
                            draftEntry.entry_id || '',
                            'coa_id',
                            draftEntry?.coa_id,
                          );
                        }}
                        onCancel={() =>
                          handleCancelEntry(draftEntry.entry_id || '')
                        }
                        autocompleteProps={{
                          id: `coa-${draftEntry.entry_id}`,
                          items: [],
                          groups: groupedCoaData,
                          variant: 'outline',
                          actionItems: [
                            {
                              id: 'add-coa',
                              label: 'Add New Account',
                              icon: <Plus />,
                            },
                          ],
                          onAction: (actionId) => {
                            if (actionId === 'add-coa') {
                              setCoaDialogOpen(true);
                            }
                          },
                        }}
                        displayValue={
                          groupedCoaData
                            .flatMap((group) => group.items)
                            .find((item) => item.value === draftEntry?.coa_id)
                            ?.label
                        }
                      />

                      {/* Debit/Credit Placeholders - Improve and handle formatting of what's displayed, when user types in the credit, the debit field should be cleared (0) and vice versa */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">
                            Debit
                            {isFxTransaction
                              ? ` (${txn.bankAccountCurrencyCode})`
                              : ''}
                          </label>
                          {/* <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={debitValue}
                            onChange={(e) => {
                              const v = Math.max(
                                0,
                                Number(e.target.value) || 0,
                              );
                              updateDraftEntry(entry.id, { source_amount: v });
                            }}
                            onBlur={() => {
                              if (canPersistEntry(entry.id)) {
                                updateEntry(entry.id, {
                                  source_amount: draftEntry.source_amount,
                                });
                              }
                            }}
                            className="w-full bg-muted/50 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          /> */}
                          <NumberField
                            amount={debitValue || 0}
                            onDraftChange={(v) =>
                              updateDraftEntry(draftEntry.entry_id || '', {
                                source_amount: v,
                              })
                            }
                            onCommit={() => {
                              if (canPersistEntry(draftEntry.entry_id || '')) {
                                updateEntry(draftEntry.entry_id || '', {
                                  source_amount: draftEntry.source_amount,
                                });
                              }
                            }}
                            onStartEditing={() => setIsEditingAmount(true)}
                            onEndEditing={() => setIsEditingAmount(false)}
                          />

                          {isFxTransaction && (serverEntry?.spent ?? 0) > 0 && (
                            <span className="text-xs text-muted-foreground">
                              ≃ {txn.reportingCurrencySymbol}{' '}
                              {formatNumber(
                                Number(
                                  draftTransactionState?.custom_exchange_rate ??
                                    txn.exchangeRate,
                                ) * (serverEntry?.spent || 0),
                              )}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">
                            Credit
                            {isFxTransaction
                              ? ` (${txn.bankAccountCurrencyCode})`
                              : ''}
                          </label>
                          <NumberField
                            amount={creditValue || 0}
                            onDraftChange={(v) =>
                              updateDraftEntry(draftEntry.entry_id || '', {
                                source_amount: v * -1,
                              })
                            }
                            onCommit={() => {
                              if (canPersistEntry(draftEntry.entry_id || '')) {
                                updateEntry(draftEntry.entry_id || '', {
                                  source_amount: draftEntry.source_amount,
                                });
                              }
                            }}
                            onStartEditing={() => setIsEditingAmount(true)}
                            onEndEditing={() => setIsEditingAmount(false)}
                          />

                          {isFxTransaction &&
                            (serverEntry?.received ?? 0) > 0 && (
                              <span className="text-xs text-muted-foreground">
                                ≃ {txn.reportingCurrencySymbol}{' '}
                                {formatNumber(
                                  Number(
                                    draftTransactionState?.custom_exchange_rate ??
                                      txn.exchangeRate,
                                  ) * (serverEntry?.received || 0),
                                )}
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Description */}
                      <EditableTextField
                        label="Description"
                        value={draftEntry?.description || ''}
                        isEditing={
                          editing?.entryId === draftEntry.entry_id &&
                          editing?.field === 'description'
                        }
                        onSave={() =>
                          handleSaveEntry(
                            draftEntry.entry_id || '',
                            'description',
                            draftEntry?.description ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(draftEntry.entry_id || '')
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: draftEntry.entry_id || '',
                            field: 'description',
                          })
                        }
                        onChange={(v) =>
                          updateDraftEntry(draftEntry.entry_id || '', {
                            description: v || null,
                          })
                        }
                      />

                      {/* Contact */}
                      <EditableSelectField
                        label="Contact"
                        value={draftEntry?.contact_id ?? ''}
                        isEditing={
                          editing?.entryId === draftEntry.entry_id &&
                          editing?.field === 'contact_id'
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: draftEntry.entry_id || '',
                            field: 'contact_id',
                          })
                        }
                        onValueChange={(value) => {
                          updateDraftEntry(draftEntry.entry_id || '', {
                            contact_id: value || null,
                          });
                        }}
                        onSave={() =>
                          handleSaveEntry(
                            draftEntry.entry_id || '',
                            'contact_id',
                            draftEntry?.contact_id ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(draftEntry.entry_id || '')
                        }
                        autocompleteProps={{
                          id: `contact-${draftEntry.entry_id}`,
                          items: contactItems,
                          variant: 'outline',
                          async: true,
                          onSearchChange: setContactSearch,
                          onLoadMore: () => {
                            if (
                              contactsQuery.hasNextPage &&
                              !contactsQuery.isFetchingNextPage
                            ) {
                              contactsQuery.fetchNextPage();
                            }
                          },
                          isLoading:
                            contactsQuery.isLoading ||
                            contactsQuery.isFetchingNextPage,
                          hasMore: contactsQuery.hasNextPage || false,
                          actionItems: [
                            {
                              id: 'add-contact',
                              label: 'Add New Contact',
                              icon: <Plus />,
                            },
                          ],
                          onAction: (actionId) => {
                            if (actionId === 'add-contact') {
                              setContactDialogOpen(true);
                            }
                          },
                        }}
                        displayValue={
                          contactItems.find(
                            (item) => item.value === draftEntry?.contact_id,
                          )?.label
                        }
                      />

                      {/* Project */}
                      <EditableSelectField
                        label="Project"
                        value={draftEntry?.project_id || ''}
                        isEditing={
                          editing?.entryId === draftEntry.entry_id &&
                          editing?.field === 'project_id'
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: draftEntry.entry_id || '',
                            field: 'project_id',
                          })
                        }
                        onValueChange={(value) => {
                          updateDraftEntry(draftEntry.entry_id || '', {
                            project_id: value || null,
                          });
                        }}
                        onSave={() =>
                          handleSaveEntry(
                            draftEntry.entry_id || '',
                            'project_id',
                            draftEntry?.project_id ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(draftEntry.entry_id || '')
                        }
                        autocompleteProps={{
                          id: `project-${draftEntry.entry_id}`,
                          items: projectItems,
                          variant: 'outline',
                          async: true,
                          onSearchChange: setProjectSearch,
                          onLoadMore: () => {
                            if (
                              projectsQuery.hasNextPage &&
                              !projectsQuery.isFetchingNextPage
                            ) {
                              projectsQuery.fetchNextPage();
                            }
                          },
                          isLoading:
                            projectsQuery.isLoading ||
                            projectsQuery.isFetchingNextPage,
                          hasMore: projectsQuery.hasNextPage || false,
                          actionItems: [
                            {
                              id: 'add-project',
                              label: 'Add New Project',
                              icon: <Plus />,
                            },
                          ],
                          onAction: (actionId) => {
                            if (actionId === 'add-project') {
                              setProjectDialogOpen(true);
                            }
                          },
                        }}
                        displayValue={
                          projectItems.find(
                            (item) => item.value === draftEntry?.project_id,
                          )?.label
                        }
                      />

                      {/* Reference */}
                      <EditableTextField
                        label="Reference"
                        value={draftEntry?.reference || ''}
                        isEditing={
                          editing?.entryId === draftEntry.entry_id &&
                          editing?.field === 'reference'
                        }
                        onSave={() =>
                          handleSaveEntry(
                            draftEntry.entry_id || '',
                            'reference',
                            draftEntry?.reference ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(draftEntry.entry_id || '')
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: draftEntry.entry_id || '',
                            field: 'reference',
                          })
                        }
                        onChange={(v) =>
                          updateDraftEntry(draftEntry.entry_id || '', {
                            reference: v || null,
                          })
                        }
                      />

                      {/* Explanation */}
                      {serverEntry?.explanation && (
                        <div className="bg-muted/50 border rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/10 transition-colors group flex items-center justify-between">
                          <span className="truncate">
                            {serverEntry.explanation}
                          </span>
                          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground flex-shrink-0" />
                        </div>
                      )}

                      {/* Review Notes - Textarea */}
                      <EditableTextField
                        label="Review Notes"
                        value={draftEntry?.review_notes || ''}
                        textarea={true}
                        isEditing={
                          editing?.entryId === draftEntry.entry_id &&
                          editing?.field === 'review_notes'
                        }
                        onSave={() =>
                          handleSaveEntry(
                            draftEntry.entry_id || '',
                            'review_notes',
                            draftEntry?.review_notes ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(draftEntry.entry_id || '')
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: draftEntry.entry_id || '',
                            field: 'review_notes',
                          })
                        }
                        onChange={(v) =>
                          updateDraftEntry(draftEntry.entry_id || '', {
                            review_notes: v || null,
                          })
                        }
                      />

                      {/* Attachments */}
                      {/* File Attachments for this Entry
                    TODO: Limit no of files, size, etc
                     */}
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">
                          Attachments
                        </label>
                        <div className="space-y-2">
                          {(draftEntryFiles.get(draftEntry.entry_id || '')
                            ?.length ?? 0) > 0 &&
                            draftEntryFiles
                              .get(draftEntry.entry_id || '')
                              ?.map((file, fileIndex) => (
                                <div
                                  key={fileIndex}
                                  onClick={() => {
                                    setSelectedFileIndex(fileIndex);
                                  }}
                                  className="cursor-pointer flex items-center justify-between bg-muted border rounded px-2 py-1.5 text-xs"
                                >
                                  <span className="truncate">{file.name}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeFile(
                                        draftEntry.entry_id || '',
                                        fileIndex,
                                      );
                                    }}
                                    className="ml-2 p-1 hover:bg-muted/70 rounded transition-colors"
                                  >
                                    <X className="w-2 h-2" />
                                  </button>
                                </div>
                              ))}
                          <label className="flex items-center justify-center gap-2 bg-muted/50 border border-dashed rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/50 transition-colors">
                            <Upload className="w-3 h-3" />
                            <span>Upload files</span>
                            <input
                              type="file"
                              multiple
                              onChange={(e) =>
                                handleFileUpload(draftEntry.entry_id || '', e)
                              }
                              className="hidden"
                            />
                          </label>
                        </div>

                        {/* <FilePreviewer
                        files={entry.files}
                        currentIndex={selectedFileIndex}
                        onClose={() => setSelectedFileIndex(null)}
                        onNavigate={(index) => setSelectedFileIndex(index)}
                      /> */}
                      </div>

                      {/* Delete Entry */}
                      <button
                        onClick={() =>
                          handleDeleteEntry(draftEntry.entry_id || '')
                        }
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      >
                        <X className="w-3 h-3" />
                        <span>Delete Entry</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* '+ Add Entry' button */}
            <div
              className="flex items-center justify-center px-2 py-1.5 gap-1 text-sm cursor-pointer border border-dashed rounded w-full"
              onClick={handleAddEntry}
            >
              <Plus className="w-4 h-4" /> <span>Add Entry</span>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 p-2 space-y-0.5">
          {/* Add better message here later*/}
          {!isTransactionBalanced() && (
            <p className="text-xs text-destructive dark:text-red-300 text-center pb-1 bg-red-50 dark:bg-red-950">
              Total debit and credit do not match
            </p>
          )}
          {/* Total Debit and Credit */}
          <div className="grid grid-cols-2 divide-x">
            <div className="text-center flex flex-col">
              <label className="text-muted-foreground text-xs">
                Total Debit
              </label>
              <p className="block text-lg">
                <FormattedAmount
                  amount={Math.abs(
                    Math.max(txn.bankAmount, 0) +
                      (draftTransactionState?.entries?.reduce(
                        (sum, e) => sum + Math.max(e?.source_amount ?? 0, 0),
                        0,
                      ) ?? 0),
                  )}
                  currency={txn.bankAccountCurrencyCode}
                  className="block text-lg"
                  showSymbol
                />
              </p>
            </div>
            <div className="text-center">
              <label className="text-muted-foreground text-xs">
                Total Credit
              </label>
              <p className="block text-lg">
                <FormattedAmount
                  amount={Math.abs(
                    Math.min(txn.bankAmount, 0) +
                      (draftTransactionState?.entries?.reduce(
                        (sum, e) => sum + Math.min(e?.source_amount ?? 0, 0),
                        0,
                      ) ?? 0),
                  )}
                  currency={txn.bankAccountCurrencyCode}
                  showSymbol
                />
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {companyId && (
        <>
          <AddContactDialog
            open={contactDialogOpen}
            onOpenChange={setContactDialogOpen}
            companyId={companyId}
          />
          <AddProjectDialog
            open={projectDialogOpen}
            onOpenChange={setProjectDialogOpen}
          />
          <AddNewCoaDialog
            open={coaDialogOpen}
            onOpenChange={setCoaDialogOpen}
          />
        </>
      )}
    </div>
  );
}

interface EditableSelectFieldProps {
  label: string;
  confidence?: number;
  value: string;

  // Editing state
  isEditing: boolean;
  onEdit: () => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;

  // Display customization
  placeholder?: string;
  emptyText?: string;
  displayValue?: string; // Optional override for display text

  // Pass ALL AutocompleteDropdown props directly
  autocompleteProps: ComponentProps<typeof AutocompleteDropdown>;
}

export function EditableSelectField({
  label,
  value,
  isEditing,
  onEdit,
  onValueChange,
  onSave,
  onCancel,
  placeholder = 'Not set',
  emptyText = 'Not set',
  displayValue,
  autocompleteProps,
  confidence,
}: EditableSelectFieldProps) {
  // Auto-compute display value if not provided
  const getDisplayLabel = () => {
    if (displayValue !== undefined) return displayValue;
    if (!value) return emptyText;

    const { items = [], groups = [] } = autocompleteProps;

    // Check grouped data first
    if (groups.length > 0) {
      const foundItem = groups
        .flatMap((group) => group.items)
        .find((item) => item.value === value);
      if (foundItem) return foundItem.label;
    }

    // Check flat items
    if (items.length > 0) {
      const foundItem = items.find((item) => {
        // Handle both normalized and raw items
        const itemValue = typeof item === 'string' ? item : item.value;
        return itemValue === value;
      });
      if (foundItem) {
        return typeof foundItem === 'string' ? foundItem : foundItem.label;
      }
    }

    return value || emptyText;
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <label>{label}</label>
        {confidence && (
          <label>
            Confidence:{' '}
            {confidence < 1
              ? Math.round(confidence * 100)
              : Math.round(confidence)}
            %
          </label>
        )}
      </div>

      <div>
        {isEditing ? (
          <div
            className="flex gap-1 items-center"
            onKeyDown={(e) => {
              // Only handle ESC here - Enter is handled by AutocompleteDropdown when open
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
            }}
          >
            <AutocompleteDropdown
              className="min-w-0 flex-1 font-normal rounded"
              classNames={{
                commandList: 'scrollbar-thin-2px',
              }}
              onValueChange={onValueChange}
              placeholder={placeholder}
              chevron={'down'}
              {...autocompleteProps}
              value={value}
            />
            <div className="flex-shrink-0 flex gap-0.5">
              <button
                onClick={onSave}
                className="p-1.5 hover:bg-accent rounded transition-colors"
                title="Save (Enter)"
                type="button"
              >
                <Check className="w-3 h-3 text-green-400" />
              </button>
              <button
                onClick={onCancel}
                className="p-1.5 hover:bg-accent rounded transition-colors"
                title="Cancel (Esc)"
                type="button"
              >
                <X className="w-3 h-3 text-red-400" />
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={onEdit}
            className="bg-muted/50 border rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/10 transition-colors group flex items-center justify-between"
          >
            <span className="truncate">{getDisplayLabel()}</span>
            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground flex-shrink-0" />
          </div>
        )}
      </div>
    </div>
  );
}

interface EditableTextFieldProps {
  value: string;
  label: string;
  isEditing: boolean;
  onEdit: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  textarea?: boolean;
  textareaRows?: number;
  type?: string;
}
export function EditableTextField({
  label,
  isEditing,
  value,
  onChange: onValueChange,
  onEdit,
  onSave,
  onCancel,
  textarea = false,
  textareaRows = 3,
  type = 'text',
  ...rest
}: EditableTextFieldProps & Record<string, any>) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <label>{label}</label>
      </div>

      <div>
        {isEditing ? (
          <div className="flex gap-1 items-center">
            {textarea ? (
              <textarea
                rows={textareaRows}
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancel();
                  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    // Ctrl+Enter or Cmd+Enter saves for textarea
                    e.preventDefault();
                    onSave();
                  }
                }}
                className="resize-none flex-1 bg-muted/50 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            ) : (
              <input
                type={type || 'text'}
                {...rest}
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancel();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    onSave();
                  }
                }}
                className="flex-1 bg-muted/50 border rounded px-2 h-9 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            )}
            <div className="flex-shrink-0 flex gap-0.5">
              <button
                onClick={onSave}
                className="p-1.5 hover:bg-accent rounded transition-colors"
                title="Save"
                type="button"
              >
                <Check className="w-3 h-3 text-green-400" />
              </button>
              <button
                onClick={onCancel}
                className="p-1.5 hover:bg-accent rounded transition-colors"
                title="Cancel"
                type="button"
              >
                <X className="w-3 h-3 text-red-400" />
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={onEdit}
            className="bg-muted/50 border rounded px-2 py-1.5 h-9 text-sm cursor-pointer hover:bg-muted/10 transition-colors group flex items-center justify-between"
          >
            <span className="truncate">{value}</span>
            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground flex-shrink-0" />
          </div>
        )}
      </div>
    </div>
  );
}

function NumberField({
  label,
  amount,
  onDraftChange,
  onCommit,
  onStartEditing,
  onEndEditing,
  isEditing,
  onEdit,
  onCancel,
  inputOnly = true,
  step,
  decimalPlaces,
}: {
  label?: string;
  amount: number;
  onDraftChange: (v: number) => void;
  onCommit: () => void;
  onStartEditing?: () => void;
  onEndEditing?: () => void;
  isEditing?: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
  inputOnly?: boolean;
  step?: number;
  decimalPlaces?: number;
}) {
  const [display, setDisplay] = useState('');

  // Sync internal display with external amount only when not editing
  // or when the amount changes from an outside source.
  useEffect(() => {
    // Don't sync display while user is editing
    if (isEditing) return;

    if (amount > 0) {
      setDisplay(formatNumber(amount, decimalPlaces));
    } else {
      setDisplay('');
    }
  }, [amount, isEditing, decimalPlaces]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Pass decimalPlaces to allow 6 decimals for exchange rate
    const maxDecimals = decimalPlaces || 2;
    if (!isValidNumericInput(raw, maxDecimals)) return;

    setDisplay(raw);
    const parsed = parseNumber(raw);
    onDraftChange(parsed);
  };

  const handleBlur = () => {
    onEndEditing?.();
    setDisplay(formatNumber(amount, decimalPlaces));
    onCommit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel?.();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onEndEditing?.();
      if (amount > 0) {
        setDisplay(formatNumber(amount, decimalPlaces));
      }
      onCommit();
    }
  };

  const inputEl = (
    <input
      type="text"
      inputMode="decimal"
      step={step}
      placeholder="0.00"
      value={display}
      onFocus={() => onStartEditing?.()}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full bg-muted/50 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );

  // Cleaned up Ternary Logic
  if (inputOnly) {
    return inputEl;
  }

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <label>{label}</label>
        </div>
      )}
      <div>
        {isEditing ? (
          <div className="flex gap-1 items-center">
            {inputEl}
            <div className="flex-shrink-0 flex gap-0.5">
              <button
                onClick={onCommit}
                className="p-1.5 hover:bg-accent rounded transition-colors"
                title="Save"
                type="button"
              >
                <Check className="w-3 h-3 text-green-400" />
              </button>
              <button
                onClick={onCancel}
                className="p-1.5 hover:bg-accent rounded transition-colors"
                title="Cancel"
                type="button"
              >
                <X className="w-3 h-3 text-red-400" />
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={onEdit}
            className="bg-muted/50 border rounded px-2 py-1.5 h-9 text-sm cursor-pointer hover:bg-muted/10 transition-colors group flex items-center justify-between"
          >
            <span className="truncate">{display || '0.00'}</span>
            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground flex-shrink-0" />
          </div>
        )}
      </div>
    </div>
  );
}

function parseNumber(v: string): number {
  return Number(v.replace(/,/g, '')) || 0;
}

function formatNumber(n: number, decimalPlaces = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(n);
}

function isValidNumericInput(v: string, maxDecimalPlaces: number = 2) {
  const pattern =
    maxDecimalPlaces > 0
      ? `^[0-9,]*\\.?[0-9]{0,${maxDecimalPlaces}}$`
      : `^[0-9,]*$`;
  return new RegExp(pattern).test(v);
}
