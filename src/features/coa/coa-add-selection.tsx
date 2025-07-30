import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, ChevronDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { AddBankAccountDialog } from "@/domains/bankAccounts/AddBankAccountDialog";
import { AddNewCoaDialog } from "@/features/coa/coa-add-new";

export function AddAccountSelection() {
  const [isAddCoaDialogOpen, setIsAddCoaDialogOpen] = useState(false);
  const [isBankAccountDialogOpen, setIsBankAccountDialogOpen] = useState(false);

  const fields = [
    { label: "New account", action: () => setIsAddCoaDialogOpen(true) },
    {
      label: "Manual bank account",
      action: () => setIsBankAccountDialogOpen(true),
    },
  ] as const;

  return (
    <div className="flex">
      {/* Dropdown for alternatives */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="ml-px px-2">
            <Plus className="w-4 h-4" />
            Add
            <ChevronDown className="w-4 h-4" />
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
