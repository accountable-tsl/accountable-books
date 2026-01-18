import type { ColumnDef } from '@tanstack/react-table';
import {
  Landmark,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Split,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { GroupedTransactionOld } from '@/modules/accounting/categorization';
import type { BankAccountWithMeta } from '@/modules/banking/accounts';

export const getCatEngineColumns = (
  bankAccountMap: Map<string, BankAccountWithMeta>,
  onSplit?: (transaction: GroupedTransactionOld) => void,
): ColumnDef<GroupedTransactionOld>[] => {
  return [
    {
      id: 'split',
      header: 'Split',
      cell: ({ row }) => {
        const txn = row.original;
        if (txn.summary.isSplit) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="hover:bg-muted cursor-pointer text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Could show split details or allow editing
                  }}
                >
                  {txn.summary.splitCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Split transaction with {txn.summary.splitCount} lines</p>
              </TooltipContent>
            </Tooltip>
          );
        }
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="hover:bg-muted h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onSplit?.(txn);
                }}
              >
                <Split className="text-muted-foreground h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Split transaction</p>
            </TooltipContent>
          </Tooltip>
        );
      },
      size: 70,
    },
    {
      id: 'bank',
      header: 'Bank',
      cell: ({ row }) => {
        const txn = row.original;
        const bankAccount = bankAccountMap.get(txn.bank_account_id);

        return (
          <div className="flex items-center gap-2">
            {bankAccount?.bankLogo ? (
              <img
                src={bankAccount.bankLogo}
                alt={bankAccount.bankName || 'Bank'}
                className="h-5 w-5 rounded object-contain"
              />
            ) : (
              <Landmark className="text-muted-foreground h-4 w-4" />
            )}
            <div className="max-w-[120px] truncate text-sm">
              {bankAccount?.displayName ||
                bankAccount?.bankName ||
                txn.bank_currency_code}
            </div>
          </div>
        );
      },
    },
    {
      id: 'date',
      header: 'Date',
      cell: ({ row }) => {
        const txn = row.original;
        return (
          <div className="text-sm">
            {txn.date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        );
      },
    },
    {
      id: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const txn = row.original;
        const firstLine = txn.lines[0];
        const description = firstLine.description || '-';
        const isTruncated = description.length > 50;

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-xs cursor-help truncate text-sm">
                {description}
              </div>
            </TooltipTrigger>
            {isTruncated && (
              <TooltipContent className="max-w-md">
                <p className="break-words">{description}</p>
              </TooltipContent>
            )}
          </Tooltip>
        );
      },
    },
    {
      id: 'fs_date',
      header: 'FS Date',
      cell: ({ row }) => {
        const txn = row.original;
        return (
          <div className="text-sm">
            {txn.fs_date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        );
      },
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: ({ row }) => {
        const txn = row.original;
        const firstLine = txn.lines[0];
        const contactName = firstLine.contact_name || '-';

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[120px] cursor-help truncate text-sm">
                {contactName}
              </div>
            </TooltipTrigger>
            {contactName !== '-' && (
              <TooltipContent>
                <p>{contactName}</p>
              </TooltipContent>
            )}
          </Tooltip>
        );
      },
    },
    {
      id: 'reference',
      header: 'Reference',
      cell: ({ row }) => {
        const txn = row.original;
        const firstLine = txn.lines[0];
        const reference = firstLine.reference || '-';

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[100px] cursor-help truncate font-mono text-sm">
                {reference}
              </div>
            </TooltipTrigger>
            {reference !== '-' && (
              <TooltipContent>
                <p className="font-mono">{reference}</p>
              </TooltipContent>
            )}
          </Tooltip>
        );
      },
    },
    {
      id: 'bank_amount',
      header: 'Bank Amount',
      cell: ({ row }) => {
        const txn = row.original;
        return (
          <div className="text-sm font-medium">
            {txn.bank_amount.toLocaleString('en-US', {
              style: 'currency',
              currency: txn.bank_currency_code,
            })}
          </div>
        );
      },
    },
    {
      id: 'account',
      header: 'Account',
      cell: ({ row }) => {
        const txn = row.original;
        if (txn.summary.isSplit) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-muted-foreground cursor-help text-sm">
                  Split ({txn.summary.splitCount} lines)
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1">
                  <p className="font-medium">Split Transaction</p>
                  <p className="text-xs">
                    {txn.lines.map((line, idx) => (
                      <span key={idx}>
                        {line.coa_name || 'Uncategorized'}
                        {idx < txn.lines.length - 1 && ', '}
                      </span>
                    ))}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        }
        const accountName = txn.summary.primaryAccountName || 'Uncategorized';
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[150px] cursor-help truncate text-sm">
                {accountName}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{accountName}</p>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      id: 'confidence',
      header: 'Confidence',
      cell: ({ row }) => {
        const txn = row.original;
        const firstLine = txn.lines[0];
        if (firstLine.confidence !== null) {
          return (
            <div className="text-sm">
              {Math.round(firstLine.confidence * 100)}%
            </div>
          );
        }
        return <div className="text-muted-foreground text-sm">-</div>;
      },
      meta: { label: 'Confidence', hidden: true },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const txn = row.original;
        const isSplit = txn.summary.isSplit;

        return (
          <div className="flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-muted h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <MoreVertical className="text-muted-foreground h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {!isSplit && (
                  <>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onSplit?.(txn);
                      }}
                      className="cursor-pointer"
                    >
                      <Split className="mr-2 h-4 w-4" />
                      Split Transaction
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  disabled
                  className="cursor-not-allowed opacity-50"
                >
                  <Paperclip className="mr-2 h-4 w-4" />
                  Add Files
                  <span className="text-muted-foreground ml-auto text-xs">
                    Soon
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled
                  className="cursor-not-allowed opacity-50"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Send Message
                  <span className="text-muted-foreground ml-auto text-xs">
                    Soon
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      size: 50,
      enableSorting: false,
    },
  ];
};
