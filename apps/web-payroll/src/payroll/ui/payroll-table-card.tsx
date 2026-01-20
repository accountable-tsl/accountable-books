import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ComputationDetailsSheet } from './computation-details-sheet';
import { cn } from '@/lib/utils';
import { Calculator, MoreVertical, Pencil, Trash2 } from 'lucide-react';

import type { z } from 'zod';
import { PayrollComputedItemSchema } from '../domain';
import { getTableRowData, ngnMoneyFormatter } from './payroll-table-utils';

import type { PayrollRunItem } from '../domain';

type PayrollComputedItem = z.infer<typeof PayrollComputedItemSchema>;

interface PayrollTableCardProps {
  runItem: PayrollRunItem;
  computedItem?: PayrollComputedItem;
  onEdit: (runItem: PayrollRunItem) => void;
  onDelete: (runItemId: string) => void;
  runStatus?: 'draft' | 'final';
}

export function PayrollTableCard({
  runItem,
  computedItem,
  onEdit,
  onDelete,
  runStatus = 'draft',
}: PayrollTableCardProps) {
  const rowData = getTableRowData(runItem, computedItem);
  const isReadOnly = runStatus === 'final';

  // State for inline editing
  const [name, setName] = useState(runItem.employeeSnapshot.fullName);
  const [role, setRole] = useState(runItem.employeeSnapshot.role || '');
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [computationDrawerOpen, setComputationDrawerOpen] = useState(false);
  const [isEditingGross, setIsEditingGross] = useState(false);
  const [grossInputValue, setGrossInputValue] = useState('');
  const [editedMonthlyGross, setEditedMonthlyGross] = useState<number | null>(
    null,
  );
  const grossInputRef = useRef<HTMLInputElement>(null);

  // Derive monthlyGross from runItem data
  const monthlyGross = editedMonthlyGross ?? rowData.monthlyGross;

  const handleNameBlur = () => {
    if (name !== runItem.employeeSnapshot.fullName) {
      onEdit({
        ...runItem,
        employeeSnapshot: {
          ...runItem.employeeSnapshot,
          fullName: name,
        },
      });
    }
  };

  const handleRoleBlur = () => {
    if (role !== runItem.employeeSnapshot.role) {
      onEdit({
        ...runItem,
        employeeSnapshot: {
          ...runItem.employeeSnapshot,
          role: role || undefined,
        },
      });
    }
  };

  const handleGrossBlur = () => {
    const parsedValue = parseFloat(grossInputValue) || 0;
    const roundedValue = Math.round(parsedValue * 100) / 100;
    setEditedMonthlyGross(null);

    const annualGross = roundedValue * 12;
    const currentComp = runItem.payProfileSnapshot.compensationHistory[0];
    const currentAnnualGross = parseFloat(currentComp.annualGross);
    const newAnnualGrossRounded = Math.round(annualGross * 100) / 100;

    if (newAnnualGrossRounded !== currentAnnualGross) {
      const nextComp = {
        ...currentComp,
        id: currentComp.id ?? crypto.randomUUID(),
        annualGross: newAnnualGrossRounded.toFixed(2),
        annualBasic: undefined,
        annualHousing: undefined,
        annualTransport: undefined,
      };
      onEdit({
        ...runItem,
        payProfileSnapshot: {
          ...runItem.payProfileSnapshot,
          compensationHistory: [nextComp],
        },
      });
    }
    setIsEditingGross(false);
    setGrossInputValue('');
  };

  const handleGrossFocus = () => {
    setEditedMonthlyGross(monthlyGross);
    const formattedValue = monthlyGross === 0 ? '' : monthlyGross.toFixed(2);
    setGrossInputValue(formattedValue);
    setIsEditingGross(true);
    setTimeout(() => {
      grossInputRef.current?.select();
    }, 0);
  };

  return (
    <>
      <div
        className={cn(
          'bg-card flex flex-col gap-3 border-b p-4',
          isReadOnly && 'pointer-events-none opacity-60 grayscale',
        )}
      >
        {/* Header: Name, Role, Actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              disabled={isReadOnly}
              spellCheck={false}
              placeholder="Employee name"
              className="h-7.5 rounded  p-0 px-1 text-[16px] font-medium shadow-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onBlur={handleRoleBlur}
              disabled={isReadOnly}
              placeholder="Role (optional)"
              className="h-7.5 rounded p-0 px-1 text-[16px] text-muted-foreground shadow-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {!isReadOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded text-muted-foreground hover:text-foreground h-8 w-4 shrink-0 items-center justify-right"
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 rounded">
                <DropdownMenuItem onClick={() => setDetailsDrawerOpen(true)}>
                  <Pencil className="mr-2 size-3.5" />
                  Edit Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setComputationDrawerOpen(true)}
                >
                  <Calculator className="mr-2 size-3.5" />
                  View Calculation
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(runItem.id)}
                >
                  <Trash2 className="mr-2 size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Gross and Net Pay */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">Gross Pay</span>
            {isEditingGross && !isReadOnly ? (
              <Input
                ref={grossInputRef}
                type="text"
                inputMode="numeric"
                autoFocus
                value={grossInputValue}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  if (rawValue === '' || /^\d*\.?\d*$/.test(rawValue)) {
                    setGrossInputValue(rawValue);
                  }
                }}
                onBlur={handleGrossBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                className="h-7.5 rounded text-[16px] border text-right font-medium tabular-nums"
              />
            ) : (
              <div
                className={cn(
                  'flex h-7.5 items-center font-medium tabular-nums border rounded pl-1',
                  !isReadOnly && 'cursor-pointer hover:text-primary',
                )}
                onClick={!isReadOnly ? handleGrossFocus : undefined}
              >
                {ngnMoneyFormatter(monthlyGross)}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-0.5 text-right">
            <span className="text-muted-foreground text-xs">Net Pay</span>
            <span
              className="cursor-pointer font-semibold text-green-600 tabular-nums dark:text-green-500"
              onClick={() => setComputationDrawerOpen(true)}
            >
              {ngnMoneyFormatter(rowData.netPay)}
            </span>
          </div>
        </div>

        {/* Summary: PAYE, Pension, Deductions */}
        <div className="mt-1 grid grid-cols-3 gap-2 border-t pt-2 text-xs">
          <div>
            <span className="text-muted-foreground block text-[10px]">PAYE</span>
            <span
              className="cursor-pointer tabular-nums"
              onClick={() => setComputationDrawerOpen(true)}
            >
              {rowData.paye ? ngnMoneyFormatter(rowData.paye) : '-'}
            </span>
          </div>
          <div className="text-center">
            <span className="text-muted-foreground block text-[10px]">
              Pension
            </span>
            <span
              className="cursor-pointer tabular-nums"
              onClick={() => setComputationDrawerOpen(true)}
            >
              {ngnMoneyFormatter(rowData.employeePension)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-muted-foreground block text-[10px]">
              Other
            </span>
            <span
              className="cursor-pointer tabular-nums"
              onClick={() => setComputationDrawerOpen(true)}
            >
              {ngnMoneyFormatter(
                (rowData.employeeNhf || 0) + (rowData.employeeNhis || 0),
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Edit Details Drawer */}
      <Drawer open={detailsDrawerOpen} onOpenChange={setDetailsDrawerOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Edit Employee</DrawerTitle>
            <DrawerDescription>
              Update employee information and compensation details
            </DrawerDescription>
          </DrawerHeader>
          <div className="scrollbar-thin-2px space-y-4 overflow-y-auto p-4">
            <div>
              <label className="text-muted-foreground text-sm">Full Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Employee name"
                className="mt-1.5 rounded text-base"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-sm">
                Role/Position
              </label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Job title"
                className="mt-1.5 rounded text-base"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-sm">
                Monthly Gross Salary
              </label>
              <Input
                type="number"
                value={monthlyGross}
                onChange={(e) => {
                  if (isReadOnly) return;
                  const monthly = parseFloat(e.target.value) || 0;
                  setEditedMonthlyGross(monthly);
                  const annualGross = monthly * 12;
                  const currentComp =
                    runItem.payProfileSnapshot.compensationHistory[0];
                  const nextComp = {
                    ...currentComp,
                    id: currentComp.id ?? crypto.randomUUID(),
                    annualGross: annualGross.toFixed(2),
                    annualBasic: undefined,
                    annualHousing: undefined,
                    annualTransport: undefined,
                  };
                  onEdit({
                    ...runItem,
                    payProfileSnapshot: {
                      ...runItem.payProfileSnapshot,
                      compensationHistory: [nextComp],
                    },
                  });
                }}
                disabled={isReadOnly}
                placeholder="0.00"
                className="mt-1.5 rounded text-base disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          <DrawerFooter>
            <Button
              onClick={() => {
                handleNameBlur();
                handleRoleBlur();
                setDetailsDrawerOpen(false);
              }}
            >
              Save Changes
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Computation Details Sheet */}
      <ComputationDetailsSheet
        open={computationDrawerOpen}
        onOpenChange={setComputationDrawerOpen}
        rowData={rowData}
        employeeName={name}
        side="bottom"
      />
    </>
  );
}
