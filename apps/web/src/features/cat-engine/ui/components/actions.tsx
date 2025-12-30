import type { GroupedTransaction } from '@/modules/accounting/categorization';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Check,
  EllipsisVerticalIcon,
  Paperclip,
  Pencil,
  Plus,
  Send,
  SplitIcon,
  Trash2,
} from 'lucide-react';

export function ActionsMenu({
  transaction,
}: {
  transaction: GroupedTransaction;
}) {
  const isSplitParent =
    transaction.rowType === 'parent' && transaction.hasMultipleEntries;
  const isSubRow = transaction.rowType === 'subRow';
  const canSplit =
    transaction.rowType === 'parent' && !transaction.hasMultipleEntries;
  const canMarkReviewed = transaction.status === 'proposed';

  const options = [
    {
      label: 'Mark as reviewed',
      icon: Check,
      onClick: () => {},
      show: canMarkReviewed,
    },
    {
      label: 'Split transaction',
      icon: SplitIcon,
      onClick: () => {},
      show: canSplit,
    },
    {
      label: 'Add entry',
      icon: Plus,
      onClick: () => {},
      show: isSplitParent,
    },
    {
      label: 'Delete entry',
      icon: Trash2,
      onClick: () => {},
      show: isSubRow,
    },
    {
      label: 'Add note',
      icon: Pencil,
      onClick: () => {},
      disabled: true,
    },
    {
      label: 'Add files',
      icon: Paperclip,
      disabled: true,
    },
    {
      label: 'Message client', // TODO: or 'Message Accountant' depending on user role
      icon: Send,
      disabled: true,
    },
  ];

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            aria-label="Open menu"
            size="icon"
            className=""
          >
            <EllipsisVerticalIcon className="text-muted-foreground h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-40" align="end">
          <DropdownMenuGroup>
            {options
              .filter((item) => (item.show ?? true) && !item.disabled)
              .map((item) => (
                <DropdownMenuItem
                  key={item.label}
                  disabled={item.disabled}
                  onSelect={item.onClick}
                  className="text-sm"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </DropdownMenuItem>
              ))}

            <DropdownMenuLabel className="text-muted-foreground my-1 border-t">
              Soon...
            </DropdownMenuLabel>
            {options
              .filter((item) => (item.show ?? true) && item.disabled)
              .map((item) => (
                <DropdownMenuItem
                  key={item.label}
                  disabled={item.disabled}
                  onSelect={item.onClick}
                  className="text-sm"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </DropdownMenuItem>
              ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
