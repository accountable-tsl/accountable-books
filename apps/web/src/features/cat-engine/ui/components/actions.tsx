import {
  Check,
  EllipsisVerticalIcon,
  Paperclip,
  Pencil,
  Send,
  SplitIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ActionsMenu() {
  const option = [
    {
      label: 'Split transaction', // TODO: Only show for transactions that's not split, for split - show entries or show split entries or show split details
      icon: SplitIcon,
      onClick: () => {},
    },
    { label: 'Accept category', icon: Check, onClick: () => {} },
    {
      label: 'Add explanation',
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
      label: 'Message client', // TODO: Message Accountant depending on user role
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
            <EllipsisVerticalIcon className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-40" align="end">
          <DropdownMenuGroup>
            {option
              .filter((item) => !item.disabled)
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

            <DropdownMenuLabel className="text-muted-foreground border-t my-1">
              Soon...
            </DropdownMenuLabel>
            {option
              .filter((item) => item.disabled)
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
