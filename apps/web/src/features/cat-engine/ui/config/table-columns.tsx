import type { GroupedTransaction } from '@/modules/accounting/categorization';
import type { ColumnDef } from '@tanstack/react-table';
import type React from 'react';
import { memo, useEffect, useState } from 'react';
import { FormattedAmount } from '@/components/FormattedAmount';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useLedgerIntentUpdaterV2 as useLedgerIntentUpdater } from '@/modules/accounting/categorization';
import {
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Landmark,
  Split,
} from 'lucide-react';

import { ActionsMenu } from '../components/actions';
import { EditableAccountCell } from '../components/editable-account-cell';
import { EditableDropdownCell } from '../components/editable-dropdown-cell';
import {
  EditableDateCell,
  EditableNumberCell,
  EditableTextCell,
} from '../components/editable-fields';

import type { GroupedCoaData } from '../types';

const fieldKey = (id: string, columnId: string) => `${id}-${columnId}`;

// Wrapper components for cells that need hooks
function DescriptionCell({
  txn,
  mode,
  markFieldClean,
  markFieldDirty,
  row,
}: {
  txn: GroupedTransaction;
  mode: 'review' | 'autosave';
  markFieldClean: (key: string) => void;
  markFieldDirty: (key: string) => void;
  row: { toggleExpanded: () => void };
}) {
  const multipleLines = txn.hasMultipleEntries;
  const showTooltip = txn.description ? true : false;
  const displayText = txn.description || 'No description';

  if (mode === 'autosave' && !multipleLines) {
    return (
      <EditableTextCell
        value={txn.description || ''}
        placeholder="No description"
        txn={txn}
        field="description"
        onCommitted={() => markFieldClean(fieldKey(txn.id, 'description'))}
        markDirty={() => markFieldDirty(fieldKey(txn.id, 'description'))}
      />
    );
  }

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'truncate text-sm',
            (!showTooltip || multipleLines) &&
              'text-muted-foreground opacity-50',
          )}
          {...(mode === 'autosave'
            ? {
                onClick: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  row.toggleExpanded();
                },
              }
            : {})}
        >
          {displayText}
        </div>
      </TooltipTrigger>
      {showTooltip && (
        <TooltipContent className="max-w-md">
          <p className="break-words">{displayText}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}

function FsDateCell({
  txn,
  mode,
  markFieldClean,
  markFieldDirty,
}: {
  txn: GroupedTransaction;
  mode: 'review' | 'autosave';
  markFieldClean: (key: string) => void;
  markFieldDirty: (key: string) => void;
}) {
  const fsDate = txn.fsDate;

  if (mode === 'autosave' && fsDate) {
    return (
      <EditableDateCell
        value={new Date(fsDate)}
        txn={txn}
        onCommitted={() => markFieldClean(fieldKey(txn.id, 'fsDate'))}
        markDirty={() => markFieldDirty(fieldKey(txn.id, 'fsDate'))}
      />
    );
  }
  return <div className="">{fsDate || ''}</div>;
}

function ContactCell({
  txn,
  mode,
  markFieldClean,
  markFieldDirty,
  row,
}: {
  txn: GroupedTransaction;
  mode: 'review' | 'autosave';
  markFieldClean: (key: string) => void;
  markFieldDirty: (key: string) => void;
  row: { toggleExpanded: () => void };
}) {
  const contactId = txn.contactId;
  const contactName = txn.contactName;

  if (mode === 'autosave' && !txn.hasMultipleEntries) {
    return (
      <EditableDropdownCell
        field="contact"
        contactId={contactId || undefined}
        contactName={contactName || undefined}
        txn={txn}
        onCommitted={() => markFieldClean(fieldKey(txn.id, 'contact'))}
        markDirty={() => markFieldDirty(fieldKey(txn.id, 'contact'))}
      />
    );
  }

  return (
    <div
      className={cn(
        'truncate text-sm font-light',
        txn.hasMultipleEntries ? 'text-muted-foreground opacity-50' : '',
      )}
      title={contactName || ''}
      {...(mode === 'autosave' && txn.hasMultipleEntries
        ? {
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              row.toggleExpanded();
            },
          }
        : {})}
    >
      {contactName || 'No contact'}
    </div>
  );
}

function ReferenceCell({
  txn,
  mode,
  markFieldClean,
  markFieldDirty,
  row,
}: {
  txn: GroupedTransaction;
  mode: 'review' | 'autosave';
  markFieldClean: (key: string) => void;
  markFieldDirty: (key: string) => void;
  row: { toggleExpanded: () => void };
}) {
  const reference = txn.reference;

  if (mode === 'autosave' && !txn.hasMultipleEntries) {
    return (
      <EditableTextCell
        value={txn.reference || ''}
        placeholder="No reference"
        txn={txn}
        field="reference"
        onCommitted={() => markFieldClean(fieldKey(txn.id, 'reference'))}
        markDirty={() => markFieldDirty(fieldKey(txn.id, 'reference'))}
      />
    );
  }

  return (
    <div
      title={reference || ''}
      className={cn(
        'truncate text-sm font-light',
        txn.hasMultipleEntries || !reference
          ? 'text-muted-foreground opacity-50'
          : '',
      )}
      {...(mode === 'autosave' && txn.hasMultipleEntries
        ? {
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              row.toggleExpanded();
            },
          }
        : {})}
    >
      {reference || '-'}
    </div>
  );
}

function ProjectCell({
  txn,
  mode,
  markFieldClean,
  markFieldDirty,
}: {
  txn: GroupedTransaction;
  mode: 'review' | 'autosave';
  markFieldClean: (key: string) => void;
  markFieldDirty: (key: string) => void;
}) {
  const projectName = txn.projectName;

  if (mode === 'autosave' && !txn.hasMultipleEntries) {
    return (
      <EditableDropdownCell
        field="project"
        projectId={txn.projectId || undefined}
        projectName={projectName || undefined}
        txn={txn}
        onCommitted={() => markFieldClean(fieldKey(txn.id, 'project'))}
        markDirty={() => markFieldDirty(fieldKey(txn.id, 'project'))}
      />
    );
  }

  return (
    <div
      title={projectName || ''}
      className={cn(
        'truncate text-sm font-light',
        txn.hasMultipleEntries || !projectName
          ? 'text-muted-foreground opacity-50'
          : '',
      )}
    >
      {projectName || '-'}
    </div>
  );
}

function ExchangeRateCell({
  txn,
  mode,
  onFxRateChange,
  markFieldClean,
  markFieldDirty,
  row,
}: {
  txn: GroupedTransaction;
  mode: 'review' | 'autosave';
  onFxRateChange?: (bankTransactionId: string, rate: number) => void;
  markFieldClean: (key: string) => void;
  markFieldDirty: (key: string) => void;
  row: { toggleExpanded: () => void };
}) {
  const { updateExchangeRate } = useLedgerIntentUpdater(txn);

  if (mode === 'autosave' && !txn.hasMultipleEntries) {
    return (
      <EditableNumberCell
        value={txn.exchangeRate}
        placeholder="0.0000"
        decimals={4}
        min={0.000001}
        onCommit={(value) => {
          const numValue = parseFloat(value);
          if (!isNaN(numValue) && numValue > 0) {
            // Update optimistic UI state immediately (spent/received)
            onFxRateChange?.(txn.bankTransactionId, numValue);

            // Update exchange rate via intent system
            updateExchangeRate(numValue);

            markFieldClean(fieldKey(txn.id, 'exchangeRate'));
          }
        }}
        markDirty={() => markFieldDirty(fieldKey(txn.id, 'exchangeRate'))}
      />
    );
  }

  return (
    <div
      title={txn.exchangeRate}
      className={cn(
        'text-muted-foreground truncate text-right text-sm font-light',
        mode === 'autosave' && txn.hasMultipleEntries && 'opacity-50',
      )}
      {...(mode === 'autosave' && txn.hasMultipleEntries
        ? {
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              row.toggleExpanded();
            },
          }
        : {})}
    >
      {txn.exchangeRate}
    </div>
  );
}

function AccountCell({
  txn,
  groupedCoaData,
  mode,
  markFieldClean,
  markFieldDirty,
  row,
}: {
  txn: GroupedTransaction;
  groupedCoaData: GroupedCoaData[];
  mode: 'review' | 'autosave';
  markFieldClean: (key: string) => void;
  markFieldDirty: (key: string) => void;
  row: { getIsExpanded: () => boolean; toggleExpanded: () => void };
}) {
  const accountName = txn.coaName;

  if (txn.hasMultipleEntries) {
    if (mode === 'review') {
      return (
        <div className="flex items-center gap-1">
          <Split className="text-muted-foreground h-3 w-3" />
          <span className="text-blue-500">Multiple entries</span>
        </div>
      );
    } else {
      const isExpanded = row.getIsExpanded();

      return (
        <div
          className="flex cursor-pointer items-center justify-between gap-1 pr-0.5 font-light decoration-blue-200 decoration-1 hover:underline"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation(); // Prevent row click
            row.toggleExpanded();
          }}
        >
          <span className="text-blue-500">View entries ({txn.entryCount})</span>
          {isExpanded ? (
            <ChevronDown className="text-muted-foreground h-3 w-3" />
          ) : (
            <ChevronRight className="text-muted-foreground h-3 w-3" />
          )}
        </div>
      );
    }
  }

  const displayName = accountName || 'Uncategorized';
  const accountCode = txn.coaCode;
  const isUncategorized = !accountName;

  if (mode === 'autosave') {
    return (
      <div className="flex items-center gap-2">
        <EditableAccountCell
          coaId={txn.coaId || undefined}
          txn={txn}
          groupedCoaData={groupedCoaData}
          onCommitted={() => {
            markFieldClean(fieldKey(txn.id, 'account'));
          }}
          markDirty={() => markFieldDirty(fieldKey(txn.id, 'account'))}
        />
      </div>
    );
  }

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex max-w-[150px] cursor-help items-center gap-1 truncate text-sm',
            isUncategorized && 'text-muted-foreground font-light',
          )}
        >
          {isUncategorized && <HelpCircle className="h-4 w-4 flex-shrink-0" />}
          {displayName}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div>
          {accountCode && (
            <span className="text-muted-foreground mr-1 text-xs">
              {accountCode}
            </span>
          )}
          <span className="font-medium">{displayName}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

const BankCell = memo(function BankCell({ txn }: { txn: GroupedTransaction }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { bankLogo, bankName, bankAccountName } = txn;
  const title = `${bankName} - ${bankAccountName}`;

  // Reset states when bankLogo changes
  useEffect(() => {
    if (bankLogo) {
      setImageLoaded(false);
      setImageError(false);
    } else {
      setImageError(true);
    }
  }, [bankLogo]);

  const showImage = bankLogo && imageLoaded && !imageError;

  return (
    <div className="flex items-center gap-2" title={title}>
      <div
        className={cn(
          'relative flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden',
          'rounded-full border dark:bg-white',
          !showImage && 'dark:bg-muted',
        )}
      >
        {/* Always show Landmark icon as background/fallback */}
        <Landmark
          strokeWidth={2}
          className={cn(
            'text-muted-foreground h-3 w-3',
            showImage && 'opacity-0', // Hide when image is ready
          )}
        />

        {/* Image overlays the icon, only visible when loaded */}
        {bankLogo && (
          <img
            src={bankLogo}
            alt={`${bankName} logo`}
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-150',
              showImage ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}
      </div>
      <p className="text-muted-foreground truncate text-sm">
        {bankAccountName}
      </p>
    </div>
  );
});
export const getCatEngineColumns = ({
  groupedCoaData,
  mode,
  reportingCurrency,
  onFxRateChange,
  markFieldClean,
  markFieldDirty,
}: {
  groupedCoaData: GroupedCoaData[];
  mode: 'review' | 'autosave';
  reportingCurrency?: string;
  onFxRateChange?: (bankTransactionId: string, rate: number) => void;
  markFieldClean: (fieldKey: string) => void;
  markFieldDirty: (fieldKey: string) => void;
}): ColumnDef<GroupedTransaction>[] => {
  return [
    {
      id: 'status-indicator',
      header: '',
      cell: ({ row }) => {
        const txn = row.original;
        const isSubRow = row.depth > 0;
        const indicatorClass = isSubRow
          ? 'bg-transparent'
          : txn.status === 'uncategorized'
            ? 'bg-gray-400/25'
            : txn.status === 'proposed'
              ? 'bg-sky-400/25'
              : txn.status === 'posted'
                ? 'bg-green-400/25'
                : 'bg-transparent';

        return (
          <div
            className={cn('absolute inset-y-0 left-0 w-1', indicatorClass)}
          />
        );
      },
      size: 5,
      minSize: 5,
      maxSize: 5,
      enableResizing: false,
      meta: {
        cellClassName: 'p-0 self-stretch',
        headerClassName: 'px-0',
      },
    },
    {
      id: 'bank',
      header: 'Bank',
      cell: ({ row }) => {
        const txn = row.original;
        return <BankCell txn={txn} />;
      },
      size: 100,
    },
    {
      id: 'date',
      header: 'Date',
      accessorKey: 'date',
      size: 100,
      minSize: 100,
      maxSize: 100,
      enableResizing: false,
    },
    {
      id: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const txn = row.original;
        return (
          <DescriptionCell
            txn={txn}
            mode={mode}
            markFieldClean={markFieldClean}
            markFieldDirty={markFieldDirty}
            row={row}
          />
        );
      },
      minSize: 175,
      meta: {
        cellClassName: mode === 'autosave' ? 'py-0' : '', // consider adding !multipleLines or similar to the conditions
      },
    },
    {
      id: 'fs_date',
      header: 'FS Date',
      accessorKey: 'fs_date',
      // accessorFn: (row) => row.fsDate,
      cell: ({ row }) => {
        const txn = row.original;
        return (
          <FsDateCell
            txn={txn}
            mode={mode}
            markFieldClean={markFieldClean}
            markFieldDirty={markFieldDirty}
          />
        );
      },
      enableResizing: false,
      maxSize: 100,
      meta: { cellClassName: mode === 'autosave' ? 'py-0' : '' },
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: ({ row }) => {
        const txn = row.original;
        return (
          <ContactCell
            txn={txn}
            mode={mode}
            markFieldClean={markFieldClean}
            markFieldDirty={markFieldDirty}
            row={row}
          />
        );
      },
      meta: {
        cellClassName: mode === 'autosave' ? 'py-0' : '',
      },
    },
    {
      id: 'reference',
      header: 'Reference',
      cell: ({ row }) => {
        const txn = row.original;
        return (
          <ReferenceCell
            txn={txn}
            mode={mode}
            markFieldClean={markFieldClean}
            markFieldDirty={markFieldDirty}
            row={row}
          />
        );
      },
      meta: {
        cellClassName: mode === 'autosave' ? 'py-0' : '',
      },
    },
    // We should consider the relationship between project and contact and how changes to contact should affect project and/or vice versa
    {
      id: 'project',
      header: 'Project',
      cell: ({ row }) => {
        const txn = row.original;
        return (
          <ProjectCell
            txn={txn}
            mode={mode}
            markFieldClean={markFieldClean}
            markFieldDirty={markFieldDirty}
          />
        );
      },
      meta: {
        cellClassName: mode === 'autosave' ? 'py-0' : '',
      },
    },
    {
      id: 'currency',
      header: 'Curr',
      cell: ({ row }) => {
        const txn = row.original;
        const currencyCode = txn.bankAccountCurrencyCode;

        return (
          <div
            title={currencyCode}
            className="text-muted-foreground truncate text-sm font-light"
          >
            {currencyCode}
          </div>
        );
      },
      size: 60,
      minSize: 60,
      maxSize: 60,
      enableResizing: false,
    },
    {
      id: 'bank_amount',
      header: 'Bank Amount',
      cell: ({ row }) => {
        const txn = row.original;
        const amount =
          txn.rowType === 'subRow' ? txn.nativeAmount : txn.bankAmount;
        return (
          <FormattedAmount
            amount={amount}
            currency={txn.bankAccountCurrencyCode}
            accountingNegatives={false}
            className={cn('flex justify-end')}
          />
        );
      },
      size: 120,
      enableResizing: false,
    },
    {
      id: 'exchange_rate',
      header: 'Exr',
      accessorKey: 'exchangeRate',
      cell: ({ row }) => {
        const txn = row.original;
        return (
          <ExchangeRateCell
            txn={txn}
            mode={mode}
            onFxRateChange={onFxRateChange}
            markFieldClean={markFieldClean}
            markFieldDirty={markFieldDirty}
            row={row}
          />
        );
      },
      size: 80,
      minSize: 80,
      maxSize: 80,
      enableResizing: false,
      meta: {
        cellClassName: mode === 'autosave' ? 'py-0' : '',
      },
    },
    {
      id: 'spent',
      header: () => (
        <div className="text-right">
          <span>Spent</span>{' '}
          {reportingCurrency && (
            <span className="text-muted-foreground text-xs">
              ({reportingCurrency})
            </span>
          )}
        </div>
      ),
      cell: ({ row }) => {
        const txn = row.original;
        const spent = txn.spent;
        const bankAmount = txn.bankAmount;

        if (spent === 0) {
          return (
            <div className="text-muted-foreground border-border/50 border-r-1 pr-4 text-right text-sm font-light">
              -
            </div>
          );
        }

        return (
          <div className="border-border/50 border-r-1 pr-2">
            <FormattedAmount
              amount={spent}
              currency={reportingCurrency}
              accountingNegatives={false}
              className={cn(
                'flex justify-end',
                // Color matches bank amount direction (negative = red, positive = green)
                bankAmount < 0 ? 'text-destructive' : 'text-green-600',
              )}
            />
          </div>
        );
      },
      size: 120,
      minSize: 120,
      maxSize: 120,
      enableResizing: false,
      meta: {
        cellClassName: 'pr-0',
      },
    },
    {
      id: 'received',
      header: () => (
        <div className="text-right">
          <span>Received</span>{' '}
          {reportingCurrency && (
            <span className="text-muted-foreground text-xs">
              ({reportingCurrency})
            </span>
          )}
        </div>
      ),
      cell: ({ row }) => {
        const txn = row.original;
        const received = txn.received;
        const bankAmount = txn.bankAmount;

        if (received === 0) {
          return (
            <div className="text-muted-foreground border-border/50 border-r-1 pr-4 text-right text-sm font-light">
              -
            </div>
          );
        }

        return (
          <div className="border-border/50 border-r-1 pr-2">
            <FormattedAmount
              amount={received}
              currency={reportingCurrency}
              accountingNegatives={false}
              className={cn(
                'flex justify-end',
                // Color matches bank amount direction (positive = green, negative = red)
                bankAmount > 0 ? 'text-green-600' : 'text-destructive',
              )}
            />
          </div>
        );
      },
      size: 120,
      minSize: 120,
      maxSize: 120,
      enableResizing: false,
      meta: {
        cellClassName: 'pr-0',
      },
    },
    {
      id: 'account',
      header: 'Account',
      cell: ({ row }) => {
        const txn = row.original;
        return (
          <AccountCell
            txn={txn}
            groupedCoaData={groupedCoaData}
            mode={mode}
            markFieldClean={markFieldClean}
            markFieldDirty={markFieldDirty}
            row={row}
          />
        );
      },
      minSize: 185,
      meta: {
        cellClassName: 'p-0 px-1',
      },
    },
    {
      id: 'confidence',
      header: 'Confidence',
      cell: ({ row }) => {
        const txn = row.original;
        if (txn?.confidence !== null && txn?.confidence !== undefined) {
          const percentage = Math.round(txn.confidence * 100);
          return <div className="text-sm font-light">{percentage}%</div>;
        }
        return (
          <div className="text-muted-foreground text-sm font-light">-</div>
        );
      },
      meta: { label: 'Confidence', hidden: true },
      size: 100,
      minSize: 100,
      maxSize: 100,
      enableResizing: false,
    },
    { id: 'status', meta: { hidden: true } },

    {
      id: '__actions',
      header: '',
      enableResizing: false,
      cell: ({ row }) => {
        return <ActionsMenu transaction={row.original} />;
      },
      size: 28,
      minSize: 28,
      maxSize: 28,
      meta: {
        cellClassName: 'p-0',
      },
    },
  ];
};
