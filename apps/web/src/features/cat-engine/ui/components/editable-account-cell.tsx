import { useEffect, useRef, useState } from 'react';

import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import type { GroupedTransaction } from '@/modules/accounting/categorization';
import { useLedgerIntentUpdaterV2 as useLedgerIntentUpdater } from '@/modules/accounting/categorization';

import type { GroupedCoaData } from '../types';
import { resolveEditableEntryId } from '../utils/resolve-editable-entry';

interface EditableAccountCellProps {
  coaId?: string;
  txn: GroupedTransaction;
  groupedCoaData: GroupedCoaData[];
  markDirty: () => void;
  onCommitted?: (coaId: string) => void;
  disabled?: boolean;
}

export function EditableAccountCell({
  coaId,
  txn,
  groupedCoaData,
  markDirty,
  onCommitted,
  disabled = false,
}: EditableAccountCellProps) {
  const { updateEntry, addEntry, getEntriesUI } = useLedgerIntentUpdater(txn);
  const [open, setOpen] = useState(false);
  const [localId, setLocalId] = useState(coaId || '');
  const localIdRef = useRef(localId);

  useEffect(() => {
    const nextLocalId = coaId || '';
    setLocalId(nextLocalId);
    localIdRef.current = nextLocalId;
  }, [coaId]);

  const commitIfDirty = () => {
    const nextLocalId = localIdRef.current;
    if (nextLocalId !== coaId) {
      // Find the selected item in the grouped data
      const selectedItem = groupedCoaData
        .flatMap((group) => group.items)
        .find((item) => item.value === nextLocalId);
      if (selectedItem) {
        const entryId = resolveEditableEntryId(txn, addEntry, getEntriesUI());
        if (!entryId) return;

        updateEntry(entryId, { coa_id: selectedItem.value });
        onCommitted?.(selectedItem.value);
      }
    }
  };

  const handleChange = (value: string) => {
    setLocalId(value); // UI only
    localIdRef.current = value;
    markDirty();
  };

  if (disabled) {
    // Find the account name from groupedCoaData
    const accountName =
      groupedCoaData
        .flatMap((group) => group.items)
        .find((item) => item.value === coaId)?.label || 'Uncategorized';

    return (
      <div className="flex-1 cursor-not-allowed opacity-60" title={accountName}>
        {accountName}
      </div>
    );
  }

  return (
    <div className="flex-1">
      <AutocompleteDropdown
        id="cat-engine-coa-list"
        value={localId}
        items={[]} // Empty since we're using groups
        variant={'ghost'}
        className="!px-0 font-normal focus-visible:ring-0"
        groups={groupedCoaData}
        chevron="down"
        onValueChange={handleChange}
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) commitIfDirty(); // commit when dropdown closes
          setOpen(isOpen);
        }}
      />
    </div>
  );
}
