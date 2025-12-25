import { useState } from 'react';

import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import type { GroupedCoaData } from '../types';

interface EditableAccountCellProps {
  coaId?: string;
  groupedCoaData: GroupedCoaData[];
  onCommit: (coaId: string) => void;
  markDirty: () => void;
}

export function EditableAccountCell({
  coaId,
  groupedCoaData,
  onCommit,
  markDirty,
}: EditableAccountCellProps) {
  const [open, setOpen] = useState(false);
  const [localId, setLocalId] = useState(coaId || '');

  const commitIfDirty = () => {
    if (localId !== coaId) {
      // Find the selected item in the grouped data
      const selectedItem = groupedCoaData
        .flatMap((group) => group.items)
        .find((item) => item.value === localId);
      if (selectedItem) {
        onCommit?.(selectedItem.value);
      }
    }
  };

  const handleChange = (value: string) => {
    setLocalId(value); // UI only
    markDirty();
  };

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
