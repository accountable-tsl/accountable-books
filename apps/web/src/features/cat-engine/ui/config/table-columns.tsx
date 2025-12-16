import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Building, HelpCircle } from 'lucide-react';

import { FormattedAmount } from '@/components/FormattedAmount';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { GroupedTransaction } from '@/modules/accounting/categorization';

import { SplitViewDialog } from '../components/split-view';

/**
 * Extracts a single value from an array of transaction line values.
 * Returns the single value if all are the same, empty string if none,
 * or "Multiple {label}" if there are different values.
 */
function getUnifiedValue(values: (string | null)[], label: string): string {
  if (values.length === 0) return '';

  const unique = new Set(values);

  if (unique.size === 1) return values[0]!;

  return `Multiple ${label}`;
}

export const getCatEngineColumns = (): ColumnDef<GroupedTransaction>[] => {
  return [
    {
      id: 'bank',
      header: 'Bank',
      cell: ({ row }) => {
        const txn = row.original;
        const logo = txn.bank_logo;
        const bankAccountName = txn.bank_account_display_name;
        const bankAccountTitle = `${txn.bank_display_name} - ${bankAccountName}`;
        return (
          <div className="flex items-center gap-2" title={bankAccountTitle}>
            <div className="flex-shrink-0 w-5 h-5 overflow-hidden rounded-full flex items-center justify-center border bg-white/80 dark:opacity-50">
              {logo ? (
                <img
                  src={logo}
                  alt={`${txn.bank_display_name} logo`}
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
      accessorFn: (row) => format(new Date(row.date), 'dd MMM yyyy'),
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
        const multipleLines = txn.lines.length > 1;

        let displayText: string;
        let showTooltip = false;

        if (multipleLines) {
          displayText = 'Transaction has multiple entries';
          showTooltip = true;
        } else {
          const description = txn.lines[0]?.description;
          if (description) {
            displayText = description;
            showTooltip = true;
          } else {
            displayText = 'No description';
          }
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
              >
                {displayText}
              </div>
            </TooltipTrigger>
            {showTooltip && (
              <TooltipContent className="max-w-md">
                <p className="break-words">
                  {multipleLines
                    ? `${displayText} - (Click row to view)`
                    : displayText}
                </p>
              </TooltipContent>
            )}
          </Tooltip>
        );
      },
      minSize: 175,
    },
    {
      id: 'fs_date',
      header: 'FS Date',
      accessorKey: 'fs_date',
      accessorFn: (row) => format(new Date(row.fs_date), 'dd MMM yyyy'),
      enableResizing: false,
      maxSize: 100,
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: ({ row }) => {
        const txn = row.original;
        const names = txn.lines.map((l) => l.contact_name).filter(Boolean);
        const contactName = getUnifiedValue(names, 'contacts');

        return (
          <div
            className={cn(
              'text-sm truncate font-light',
              contactName.startsWith('Multiple')
                ? 'text-muted-foreground opacity-50'
                : '',
            )}
            title={contactName || ''}
          >
            {contactName || 'No contact'}
          </div>
        );
      },
    },
    {
      id: 'reference',
      header: 'Reference',
      cell: ({ row }) => {
        const txn = row.original;
        const references = txn.lines.map((l) => l.reference).filter(Boolean);
        const reference = getUnifiedValue(references, 'references');

        return (
          <div
            title={reference || ''}
            className={cn(
              'text-sm truncate font-light',
              reference.startsWith('Multiple') || !reference
                ? 'text-muted-foreground opacity-50'
                : '',
            )}
          >
            {reference || '-'}
          </div>
        );
      },
    },
    {
      id: 'project',
      header: 'Project',
      cell: ({ row }) => {
        const txn = row.original;
        const projectNames = txn.lines
          .map((l) => l.project_name)
          .filter(Boolean);
        const projectName = getUnifiedValue(projectNames, 'projects');

        return (
          <div
            title={projectName || ''}
            className={cn(
              'text-sm truncate font-light',
              projectName.startsWith('Multiple') || !projectName
                ? 'text-muted-foreground opacity-50'
                : '',
            )}
          >
            {projectName || ''}
          </div>
        );
      },
    },
    {
      id: 'currency',
      header: 'Curr',
      cell: ({ row }) => {
        const txn = row.original;
        // Currency is the same for all lines since they're from the same bank account
        const currencyCode = txn.bank_currency_code;

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
            amount={txn.bank_amount}
            currency={txn.bank_currency_code}
            accountingNegatives={false}
            className={cn(
              'flex justify-end ',
              txn.bank_amount < 0 ? 'text-destructive' : '',
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
      cell: ({ row }) => {
        const txn = row.original;
        // Exchange rate is the same for all lines since they're from the same transaction
        const exchangeRate = txn.lines[0]?.custom_exchange_rate;

        return (
          <div className="text-sm font-light text-muted-foreground text-left">
            {exchangeRate ? exchangeRate.toFixed(4) : '1.0000'}
          </div>
        );
      },
      size: 80,
      minSize: 80,
      maxSize: 80,
      enableResizing: false,
    },
    {
      id: 'spent',
      header: 'Spent',
      cell: ({ row }) => {
        const txn = row.original;
        // Sum all negative reporting amounts (outflows)
        const spent = txn.lines.reduce((sum, line) => {
          return line.reporting_amount < 0
            ? sum + Math.abs(line.reporting_amount)
            : sum;
        }, 0);

        if (spent === 0) {
          return (
            <div className="text-sm font-light text-center text-muted-foreground">
              -
            </div>
          );
        }

        // Get reporting currency from first line (all lines should have same reporting currency)
        // For now, we'll use bank currency as proxy - TODO: add reporting_currency_code to view
        return (
          <FormattedAmount
            amount={spent}
            currency={txn.bank_currency_code}
            accountingNegatives={false}
            className={cn(
              'flex justify-end ',
              txn.bank_amount < 0 ? 'text-destructive' : 'text-green-600',
            )}
          />
        );
      },
      size: 120,
      minSize: 120,
      maxSize: 120,
      enableResizing: false,
    },
    {
      id: 'received',
      header: 'Received',
      cell: ({ row }) => {
        const txn = row.original;
        // Sum all positive reporting amounts (inflows)
        const received = txn.lines.reduce((sum, line) => {
          return line.reporting_amount > 0 ? sum + line.reporting_amount : sum;
        }, 0);

        if (received === 0) {
          return (
            <div className="text-sm font-light text-center text-muted-foreground">
              -
            </div>
          );
        }

        return (
          <FormattedAmount
            amount={received}
            currency={txn.bank_currency_code}
            accountingNegatives={false}
            className={cn(
              'flex justify-end',
              txn.bank_amount < 0 ? 'text-destructive' : 'text-green-600',
            )}
          />
        );
      },
      size: 120,
      minSize: 120,
      maxSize: 120,
      enableResizing: false,
    },
    {
      id: 'account',
      header: 'Account',
      cell: ({ row }) => {
        const txn = row.original;
        const accountNames = txn.lines.map((l) => l.coa_name).filter(Boolean);
        const accountName = getUnifiedValue(accountNames, 'accounts');

        if (txn.summary.isSplit) {
          return <SplitViewDialog txn={txn} />;
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
        const accountCode = txn.lines[0]?.coa_code;
        const isUncategorized = !accountName;

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
      minSize: 175,
      meta: {
        cellClassName: 'p-0 px-1',
      },
    },
    {
      id: 'confidence',
      header: 'Confidence',
      cell: ({ row }) => {
        const txn = row.original;
        const firstLine = txn.lines[0];
        if (
          firstLine?.confidence !== null &&
          firstLine?.confidence !== undefined
        ) {
          const percentage = Math.round(firstLine.confidence * 100);
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
  ];
};
