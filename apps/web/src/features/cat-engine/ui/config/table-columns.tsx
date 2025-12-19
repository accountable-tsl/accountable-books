import type { ColumnDef } from '@tanstack/react-table';
import {
  Building,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Split,
} from 'lucide-react';

import { FormattedAmount } from '@/components/FormattedAmount';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { GroupedTransaction } from '@/modules/accounting/categorization';

import { ActionsMenu } from '../components/actions';
import { EditableAccountCell } from '../components/editable-account-cell';
import { EditableDropdownCell } from '../components/editable-dropdown-cell';
import {
  EditableDateCell,
  EditableNumberCell,
  EditableTextCell,
} from '../components/editable-fields';
export const getCatEngineColumns = ({
  mode,
  reportingCurrency,
  onExchangeRateChange,
}: {
  mode: 'review' | 'autosave';
  reportingCurrency?: string;
  onExchangeRateChange?: (transactionId: string, newRate: number) => void;
}): ColumnDef<GroupedTransaction>[] => {
  return [
    {
      id: 'bank',
      header: 'Bank',
      cell: ({ row }) => {
        const txn = row.original;
        const logo = txn.bankLogo;
        const bankAccountName = txn.bankAccountName;
        const bankAccountTitle = `${txn.bankName} - ${bankAccountName}`;
        return (
          <div className="flex items-center gap-2" title={bankAccountTitle}>
            <div className="flex-shrink-0 w-5 h-5 overflow-hidden rounded-full flex items-center justify-center border bg-white/80 dark:opacity-50">
              {logo ? (
                <img
                  src={logo}
                  alt={`${txn.bankName} logo`}
                  className="w-4 h-4 object-contain"
                />
              ) : (
                <Building className="w-4 h-4" />
              )}
            </div>

            <p className="text-sm truncate text-muted-foreground">
              {bankAccountName}
            </p>
          </div>
        );
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
        const multipleLines = txn.hasMultipleEntries;

        const showTooltip = txn.description ? true : false;
        const displayText = txn.description || 'No description';

        if (mode === 'autosave' && !multipleLines) {
          return (
            <EditableTextCell
              value={txn.description || ''}
              placeholder="No description"
            />
          );
        }

        return (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'text-sm truncate',
                  (!showTooltip || multipleLines) &&
                    'text-muted-foreground opacity-50',
                )}
                {...(mode === 'autosave'
                  ? {
                      onClick: (e) => {
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
        const fsDate = txn.fsDate;
        if (mode === 'autosave' && fsDate) {
          return <EditableDateCell value={new Date(fsDate)} />;
        }
        return <div className="">{fsDate || ''}</div>;
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
        const contactId = txn.contactId;
        const contactName = txn.contactName;

        if (mode === 'autosave' && !txn.hasMultipleEntries) {
          return (
            <EditableDropdownCell
              field="contact"
              contactId={contactId || undefined}
              contactName={contactName || undefined}
            />
          );
        }

        return (
          <div
            className={cn(
              'text-sm truncate font-light',
              txn.hasMultipleEntries ? 'text-muted-foreground opacity-50' : '',
            )}
            title={contactName || ''}
            {...(mode === 'autosave' && txn.hasMultipleEntries
              ? {
                  onClick: (e) => {
                    e.stopPropagation();
                    row.toggleExpanded();
                  },
                }
              : {})}
          >
            {contactName || 'No contact'}
          </div>
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
        const reference = txn.reference;

        if (mode === 'autosave' && !txn.hasMultipleEntries) {
          return (
            <EditableTextCell
              value={reference || ''}
              placeholder="No Reference"
            />
          );
        }

        return (
          <div
            title={reference || ''}
            className={cn(
              'text-sm truncate font-light',
              txn.hasMultipleEntries || !reference
                ? 'text-muted-foreground opacity-50'
                : '',
            )}
            {...(mode === 'autosave' && txn.hasMultipleEntries
              ? {
                  onClick: (e) => {
                    e.stopPropagation();
                    row.toggleExpanded();
                  },
                }
              : {})}
          >
            {reference || '-'}
          </div>
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
        const projectName = txn.projectName;

        if (mode === 'autosave' && !txn.hasMultipleEntries) {
          return (
            <EditableDropdownCell
              field="project"
              projectId={txn.projectId || undefined}
              projectName={projectName || undefined}
            />
          );
        }

        return (
          <div
            title={projectName || ''}
            className={cn(
              'text-sm truncate font-light',
              txn.hasMultipleEntries || !projectName
                ? 'text-muted-foreground opacity-50'
                : '',
            )}
          >
            {projectName || ''}
          </div>
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
            className="text-sm truncate font-light text-muted-foreground"
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
        return (
          <FormattedAmount
            amount={txn.nativeAmount}
            currency={txn.bankAccountCurrencyCode}
            accountingNegatives={false}
            className={cn(
              'flex justify-end ',
              txn.nativeAmount < 0 ? 'text-destructive' : '',
            )}
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

        // On update, notify using toast or sth that this affects all entries for this transaction if it is a transaction with multiple entries
        if (mode === 'autosave' && !txn.hasMultipleEntries) {
          return (
            <EditableNumberCell
              value={txn.exchangeRate}
              placeholder="0.0000"
              decimals={4}
              min={0.0001}
              onValueChange={(value) => {
                const numValue = parseFloat(value);
                if (!isNaN(numValue) && numValue > 0 && onExchangeRateChange) {
                  onExchangeRateChange(txn.id, numValue);
                }
              }}
            />
          );
        }

        return (
          <div
            title={txn.exchangeRate}
            className={cn(
              'text-sm truncate font-light text-muted-foreground text-right',
              mode === 'autosave' && txn.hasMultipleEntries && 'opacity-50',
            )}
            {...(mode === 'autosave' && txn.hasMultipleEntries
              ? {
                  onClick: (e) => {
                    e.stopPropagation();
                    row.toggleExpanded();
                  },
                }
              : {})}
          >
            {txn.exchangeRate}
          </div>
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
      // header: `Spent ${reportingCurrency ? `(${reportingCurrency})` : ''}`,
      header: () => (
        <div className="text-right">
          <span>Spent</span>{' '}
          {reportingCurrency && (
            <span className="text-xs text-muted-foreground">
              ({reportingCurrency})
            </span>
          )}
        </div>
      ),
      cell: ({ row }) => {
        const txn = row.original;
        // Sum all negative reporting amounts (outflows)
        const spent = txn.spent;

        if (spent === 0) {
          return (
            <div className="text-sm font-light text-right text-muted-foreground pr-4 border-r-1 border-border/50">
              -
            </div>
          );
        }

        return (
          <div className="pr-2 border-r-1 border-border/50">
            <FormattedAmount
              amount={spent}
              currency={txn.bankAccountCurrencyCode}
              accountingNegatives={false}
              className={cn(
                'flex justify-end',
                spent !== 0 ? 'text-destructive' : '',
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
            <span className="text-xs text-muted-foreground">
              ({reportingCurrency})
            </span>
          )}
        </div>
      ),
      cell: ({ row }) => {
        const txn = row.original;
        // Sum all positive reporting amounts (inflows)
        const received = txn.received;

        if (received === 0) {
          return (
            <div className="text-sm font-light text-right text-muted-foreground pr-4 border-r-1 border-border/50">
              -
            </div>
          );
        }

        return (
          <div className="pr-2 border-r-1 border-border/50">
            <FormattedAmount
              amount={received}
              currency={txn.bankAccountCurrencyCode}
              accountingNegatives={false}
              className={cn(
                'flex justify-end',
                received !== 0 ? 'text-green-600' : '',
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
        const accountName = txn.coaName;

        if (txn.hasMultipleEntries) {
          if (mode === 'review') {
            return (
              <div className="flex items-center gap-1">
                <Split className="w-3 h-3 text-muted-foreground" />
                <span className="text-blue-500">Multiple entries</span>
              </div>
            );
          } else {
            const isExpanded = row.getIsExpanded();

            return (
              <div
                className="flex items-center justify-between pr-0.5 gap-1 cursor-pointer font-light hover:underline decoration-1 decoration-blue-200"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent row click
                  row.toggleExpanded();
                }}
              >
                <span className="text-blue-500">
                  View entries ({txn.entryCount})
                </span>
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
            );
          }
        }

        // if (txn.summary.isSplit) {
        //   return (
        //     <div className="flex items-center gap-1 p-1 rounded bg-muted/20 border border-muted">
        //       <Split className="w-4 h-4 text-muted-foreground" />
        //       <SplitViewDialog txn={txn} />
        //     </div>
        //   );
        // }
        const displayName = accountName || 'Uncategorized';
        const accountCode = txn.coaCode;
        const isUncategorized = !accountName;

        if (mode === 'autosave') {
          return (
            <EditableAccountCell
              coaId={txn.coaId || undefined}
              coaName={txn.coaName || undefined}
            />
          );
        }

        return (
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'text-sm truncate max-w-[150px] cursor-help flex items-center gap-1',
                  isUncategorized && 'font-light text-muted-foreground',
                )}
              >
                {isUncategorized && (
                  <HelpCircle className="w-4 h-4 flex-shrink-0" />
                )}
                {displayName}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div>
                {accountCode && (
                  <span className="text-xs text-muted-foreground mr-1">
                    {accountCode}
                  </span>
                )}
                <span className="font-medium">{displayName}</span>
              </div>
            </TooltipContent>
          </Tooltip>
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
          <div className="text-sm font-light text-muted-foreground">-</div>
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
      cell: () => {
        return <ActionsMenu />;
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
