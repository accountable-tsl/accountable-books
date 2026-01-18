import {
  Building,
  CheckCircle,
  EyeIcon,
  Focus,
  HelpCircle,
  Menu,
  Rows3,
  TableProperties,
  Zap,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { AutosaveIcon } from '@/assets/icons/autosave';
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectGroup,
  MultiSelectItem,
  MultiSelectTrigger,
  MultiSelectValue,
} from '@/components/ui/multi-select';
import type { CategorizationTransactionStatus } from '@/modules/accounting/categorization';
import type { BankAccountWithMeta } from '@/modules/banking/accounts';

import { ToggleButton } from './toggle-button';

// export function LeftCatEngineToolbar({
//   view,
//   setView,
// }: {
//   view: 'table' | 'group';
//   setView: (view: 'table' | 'group') => void;
// }) {
//   return (
//     <div className="flex gap-1 items-center px-1 py-0.5 bg-muted w-fit rounded h-full">
//       <div className="text-muted-foreground text-sm pl-1">View:</div>

//       <ToggleButton
//         active={view === 'table'}
//         onClick={() => setView('table')}
//         icon={<TableProperties className="w-4 h-4" />}
//         tooltip="Table View"
//       />
//       <ToggleButton
//         active={view === 'group'}
//         onClick={() => setView('group')}
//         icon={<Rows3 className="w-4 h-4" />}
//         tooltip="View by Confidence"
//       />
//     </div>
//   );
// }
export function LeftCatEngineToolbar({
  mode,
  setMode,
}: {
  mode: 'review' | 'autosave';
  setMode: (mode: 'review' | 'autosave') => void;
}) {
  return (
    <div className="bg-muted flex h-full w-fit items-center gap-1 rounded px-1 py-0.5">
      <div className="text-muted-foreground pl-1 text-sm">Mode:</div>

      <ToggleButton
        active={mode === 'review'}
        onClick={() => setMode('review')}
        icon={<EyeIcon className="h-4 w-4" />}
        tooltip="Review Mode - Manual save required"
      />
      <ToggleButton
        active={mode === 'autosave'}
        onClick={() => setMode('autosave')}
        icon={<AutosaveIcon className="h-4 w-4" />}
        tooltip="Autosave Mode - Changes are saved automatically"
      />
    </div>
  );
}

export function RightCatEngineToolbar({
  rowHeight,
  setRowHeight,
  isFullScreen,
  setIsFullScreen,
  view,
  setView,
}: {
  rowHeight: 'min' | 'mid' | 'max';
  setRowHeight: (height: 'min' | 'mid' | 'max') => void;
  isFullScreen: boolean;
  setIsFullScreen: (isFullScreen: boolean) => void;
  view: 'table' | 'group';
  setView: (view: 'table' | 'group') => void;
}) {
  return (
    <div className="bg-muted flex h-full w-fit items-center gap-1 rounded px-1 py-0.5">
      <div className="text-muted-foreground pl-1 text-sm">Row:</div>
      <div className="text-muted-foreground flex items-center gap-1">
        <ToggleButton
          active={rowHeight === 'min'}
          onClick={() => setRowHeight('min')}
          icon={<Menu strokeWidth={1} className="h-4 w-4" />}
          tooltip="Compact Row Height"
          ariaLabel="Set compact row height"
        />
        <ToggleButton
          active={rowHeight === 'mid'}
          onClick={() => setRowHeight('mid')}
          icon={<Menu strokeWidth={2.5} className="h-4 w-4" />}
          tooltip="Medium Row Height"
          ariaLabel="Set medium row height"
        />
        <ToggleButton
          active={rowHeight === 'max'}
          onClick={() => setRowHeight('max')}
          icon={<Menu strokeWidth={4} className="h-4 w-4" />}
          tooltip="Large Row Height"
          ariaLabel="Set large row height"
        />
        <div className="text-muted-foreground">|</div>

        <ToggleButton
          active={view === 'table'}
          onClick={() => setView('table')}
          icon={<TableProperties className="h-4 w-4" />}
          tooltip="Table View"
        />
        <ToggleButton
          active={view === 'group'}
          onClick={() => setView('group')}
          icon={<Rows3 className="h-4 w-4" />}
          tooltip="View by Confidence"
        />
        <ToggleButton
          active={isFullScreen}
          onClick={() => setIsFullScreen(!isFullScreen)}
          icon={<Focus className="h-4 w-4" />}
          tooltip="Focus"
        />
      </div>
    </div>
  );
}

export function CenterCatEngineToolbar({
  selectedBankAccountIds = [],
  onBankAccountsChange,
  currentStatus,
  onStatusToggle,
  bankAccounts = [],
  view = 'table',
}: {
  selectedBankAccountIds?: string[];
  onBankAccountsChange?: (bankAccountIds: string[]) => void;
  currentStatus?: Set<CategorizationTransactionStatus>;
  onStatusToggle?: (statuses: Set<CategorizationTransactionStatus>) => void;
  bankAccounts?: BankAccountWithMeta[];
  view?: 'table' | 'group';
}) {
  // Create a memoized map of bank account display names to IDs for efficient lookups
  const bankAccountNameToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    bankAccounts.forEach((account) => {
      map.set(account.displayName, account.id);
    });
    return map;
  }, [bankAccounts]);

  // Create a memoized set of selected bank account IDs for efficient lookups
  const selectedBankAccountIdsSet = useMemo(
    () => new Set(selectedBankAccountIds),
    [selectedBankAccountIds],
  );

  const handleBankAccountsChange = (values: string[]) => {
    // Values are bank account display names, convert to IDs
    const ids = values
      .map((name) => bankAccountNameToIdMap.get(name))
      .filter((id): id is string => id !== undefined);
    onBankAccountsChange?.(ids);
  };

  const handleStatusToggle = useCallback(
    (status: CategorizationTransactionStatus) => {
      if (!onStatusToggle) return;
      const newStatusSet = new Set(currentStatus || []);
      if (newStatusSet.has(status)) {
        newStatusSet.delete(status);
      } else {
        newStatusSet.add(status);
      }
      onStatusToggle(newStatusSet);
    },
    [currentStatus, onStatusToggle],
  );

  // Convert selected IDs to names for MultiSelect (O(n) but only for display, not filtering)
  const selectedBankAccountNamesForSelect = useMemo(() => {
    return bankAccounts
      .filter((acc) => selectedBankAccountIdsSet.has(acc.id))
      .map((acc) => acc.displayName);
  }, [bankAccounts, selectedBankAccountIdsSet]);

  return (
    <div className="flex h-7.5 min-h-0 items-center gap-2">
      <MultiSelect
        values={selectedBankAccountNamesForSelect}
        onValuesChange={handleBankAccountsChange}
      >
        <MultiSelectTrigger className="h-7.5 min-h-7.5 w-48 min-w-48 rounded !px-1 !py-0.5 text-xs">
          <MultiSelectValue
            overflowBehavior="cutoff"
            placeholder="All Banks"
            className="h-full"
          />
        </MultiSelectTrigger>
        <MultiSelectContent
          className="rounded"
          search={bankAccounts.length > 5}
        >
          {bankAccounts.length === 0 ? (
            <MultiSelectGroup>
              <MultiSelectItem value="empty" disabled>
                No banks available
              </MultiSelectItem>
            </MultiSelectGroup>
          ) : (
            <MultiSelectGroup>
              {bankAccounts.map((account) => (
                <MultiSelectItem
                  key={account.id}
                  value={account.displayName}
                  className="px-1"
                >
                  <div className="flex items-center gap-1">
                    <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[0.5px] object-contain p-0.25">
                      {account.bankLogo ? (
                        <img
                          src={account.bankLogo}
                          alt={`${account.bankName} logo`}
                          className="h-4 w-4 flex-shrink-0 object-contain"
                        />
                      ) : (
                        <Building strokeWidth={1} className="!h-3 !w-3" />
                      )}
                    </div>
                    <span className="truncate text-xs font-normal">
                      {account.displayName}
                    </span>
                  </div>
                </MultiSelectItem>
              ))}
            </MultiSelectGroup>
          )}
        </MultiSelectContent>
      </MultiSelect>
      {/* Only show status toggles in table view, not in group/accordion view */}
      {view === 'table' && (
        <div className="text-muted-foreground bg-muted flex h-full w-fit items-center gap-1 rounded px-1 py-0.5">
          <ToggleButton
            active={currentStatus?.has('uncategorized') ?? false}
            onClick={() => handleStatusToggle('uncategorized')}
            icon={<HelpCircle className="h-4 w-4" />}
            tooltip="Uncategorized"
            ariaLabel="Filter/unfilter uncategorized transactions"
          />
          <ToggleButton
            active={currentStatus?.has('proposed') ?? false}
            onClick={() => handleStatusToggle('proposed')}
            icon={<Zap className="h-4 w-4" />}
            tooltip="Auto-categorized"
            ariaLabel="Filter/unfilter auto-categorized transactions"
          />
          <ToggleButton
            active={currentStatus?.has('posted') ?? false}
            onClick={() => handleStatusToggle('posted')}
            icon={<CheckCircle className="h-4 w-4" />}
            tooltip="Posted"
            ariaLabel="Filter/unfilter posted transactions"
          />
        </div>
      )}
    </div>
  );
}
