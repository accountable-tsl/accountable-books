import { ChevronDown, Plus } from 'lucide-react';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { AddNewCoaDialog } from '@/features/chart-of-accounts/ui/components/coa-add-new';
import { AddBankAccountDialog } from '@/modules/banking/accounts/ui/ba-add-dialog';

export function AddAccountSelection() {
  const [isAddCoaDialogOpen, setIsAddCoaDialogOpen] = useState(false);
  const [isBankAccountDialogOpen, setIsBankAccountDialogOpen] = useState(false);

  const fields = [
    { label: 'New account', action: () => setIsAddCoaDialogOpen(true) },
    {
      label: 'Manual bank account',
      action: () => setIsBankAccountDialogOpen(true),
    },
  ] as const;

  return (
    <div className="flex">
      {/* Dropdown for alternatives */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="ml-px px-2">
            <Plus className="h-4 w-4" />
            Add
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          {fields.map((item, index) => (
            <React.Fragment key={item.label}>
              <DropdownMenuItem onClick={item.action}>
                {item.label}
              </DropdownMenuItem>
              {index !== fields.length - 1 && <Separator />}
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <>
        <AddBankAccountDialog
          open={isBankAccountDialogOpen}
          onOpenChange={setIsBankAccountDialogOpen}
        />
      </>

      <>
        <AddNewCoaDialog
          open={isAddCoaDialogOpen}
          onOpenChange={setIsAddCoaDialogOpen}
        />
      </>
    </div>
  );
}
