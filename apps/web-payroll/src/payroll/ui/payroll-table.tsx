import type { z } from 'zod';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  Calculator,
  Eye,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';

import { resolveBhtBreakdown } from '../compute/resolve-settings';
import { PayrollComputedItemSchema, PayrollRunSettingsSchema } from '../domain';
import { getTableRowData } from './payroll-table-utils';

import type { PayrollRunItem } from '../domain';

type PayrollComputedItem = z.infer<typeof PayrollComputedItemSchema>;
type PayrollRunSettings = z.infer<typeof PayrollRunSettingsSchema>;

interface PayrollTableProps {
  runItems: PayrollRunItem[];
  computedItems?: PayrollComputedItem[];
  onEdit: (runItem: PayrollRunItem) => void;
  onDelete: (runItemId: string) => void;
  onAdd: () => void;
  viewMode: 'standard' | 'detailed';
  runSettings?: PayrollRunSettings; // For resolving BHT breakdown
  runStatus?: 'draft' | 'final'; // Run status to determine if editing is allowed
}
export function PayrollTable({
  runItems = [],
  computedItems = [],
  onEdit,
  onDelete,
  onAdd,
  viewMode,
  runSettings,
  runStatus = 'draft',
}: PayrollTableProps) {
  // Pass runStatus to rows for editing control
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const prevItemCountRef = useRef(runItems.length);

  // Create a map of computed items by runItemId for quick lookup
  const computedItemsMap = new Map<string, PayrollComputedItem>();
  for (const item of computedItems) {
    computedItemsMap.set(item.runItemId, item);
  }

  // Auto-scroll to top when a new item is added
  useEffect(() => {
    if (runItems.length > prevItemCountRef.current) {
      tableContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    prevItemCountRef.current = runItems.length;
  }, [runItems.length]);
  // Table header configuration
  // key: unique identifier for the column
  // show: whether to show based on viewMode
  // visible: whether column is currently visible (can be toggled)
  const headers = [
    {
      key: 'employee',
      label: 'Employee',
      className: 'min-w-[180px]',
      show: true,
      visible: true,
    },
    {
      key: 'role',
      label: 'Role',
      className: 'w-[120px] px-0',
      show: viewMode === 'detailed',
      visible: viewMode === 'detailed',
    },
    {
      key: 'gross',
      label: 'Monthly Gross',
      className: 'w-[140px] text-right',
      show: true,
      visible: true,
    }, // Monthly gross for the current month pay run
    {
      key: 'bht',
      label: 'B+H+T',
      className: 'w-[120px] text-right',
      show: viewMode === 'detailed',
      visible: viewMode === 'detailed',
    },
    {
      key: 'paye',
      label: 'PAYE',
      className: 'text-right text-red-500',
      show: true,
      visible: true,
    }, // PAYE for the current pay run
    {
      key: 'pension',
      label: 'EE Pension',
      className: 'text-right',
      show: true,
      visible: true,
    }, // Employee Pension for the current month
    {
      key: 'otherDeductions',
      label: 'Other Deductions',
      className: 'text-right max-w-[110px]',
      show: true,
      visible: true,
    }, // Other deductions (NHF, NHIS, etc.) for the current month
    {
      key: 'net',
      label: 'Net Pay',
      className: 'text-right bg-green-50 min-w-[110px]',
      show: true,
      visible: true,
    }, // Net pay for the current month
    { key: 'actions', label: '', className: 'w-12', show: true, visible: true }, // Actions column
  ];

  return (
    <div className="flex-1 md:flex md:min-h-0 md:flex-col">
      <div className="border-b py-2 pr-4 md:flex md:items-center md:justify-between">
        <div className="pl-4 text-sm font-medium md:hidden">Staff List (2)</div>

        <div className="relative hidden max-w-sm md:block">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name..."
            className="h-8 rounded border-none pl-9 shadow-none"
          />
        </div>
        <Button size="sm" className="hidden rounded md:flex" onClick={onAdd}>
          <Plus className="size-4" />
          <span>Add Employee</span>
        </Button>
      </div>
      {/* Mobile View Cards */}
      <div className="md:hidden">
        <div className="divide-border divide-y">
          {/* {employees.map((e) => {
            // const result = calculatePayroll(e);

            return (
              <PayrollTableCard
              key={e.id}
              employee={e}
              onEdit={() => onEdit(e)}
              onDelete={() => onDelete(e.id)}
              />
            );
          })} */}
          {/* Mobile view cards - TODO: implement with runItems */}
          {/* {runItems.map((item) => (
            <PayrollTableCard
              key={item.id}
              runItem={item}
              computedItem={computedItemsMap.get(item.id)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))} */}
        </div>
      </div>

      {/* Desktop View */}
      <div className="hidden md:flex md:min-h-0 md:flex-col">
        <Table
          ref={tableContainerRef}
          tableContainerClassName="flex-1 min-h-0 overflow-auto scrollbar-thin-2px"
        >
          <TableHeader className="bg-muted sticky top-0 z-50">
            <TableRow className="bg-muted/30 hover:bg-muted/30 md:bg-muted hover:bg-muted text-[11px] tracking-wider uppercase">
              {headers
                .filter((header) => header.show && header.visible)
                .map((header) => (
                  <TableHead key={header.key} className={header.className}>
                    {header.label}
                  </TableHead>
                ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(runItems || []).length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={headers.filter((h) => h.show && h.visible).length}
                  className="text-muted-foreground py-8 text-center"
                >
                  No employees found
                </TableCell>
              </TableRow>
            ) : (
              <>
                {(runItems || []).map((runItem) => {
                  const computedItem = computedItemsMap.get(runItem.id);
                  return (
                    <PayrollTableRow
                      key={runItem.id}
                      runItem={runItem}
                      computedItem={computedItem}
                      viewMode={viewMode}
                      headers={headers}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      className={cn(runItems.length < 6 ? '!border-b' : '')}
                      runSettings={runSettings}
                      runStatus={runStatus}
                    />
                  );
                })}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Mock computed values for now
interface MockComputedValues {
  basic: number;
  housing: number;
  transport: number;
  gross: number;
  paye: number;
  pension: number;
  nhf: number;
  nhis: number;
  otherDeductions: number;
  net: number;
  employerPension?: number;
}

interface HeaderConfig {
  key: string;
  label: string;
  className: string;
  show: boolean;
  visible: boolean;
}

interface PayrollTableRowProps {
  runItem: PayrollRunItem;
  computedItem?: PayrollComputedItem;
  viewMode: 'standard' | 'detailed';
  headers: HeaderConfig[];
  onEdit: (runItem: PayrollRunItem) => void;
  onDelete: (runItemId: string) => void;
  className?: string;
  runSettings?: PayrollRunSettings; // For resolving BHT breakdown
  runStatus?: 'draft' | 'final'; // Run status to determine if editing is allowed
}

function PayrollTableRow({
  runItem,
  computedItem,
  viewMode,
  headers,
  onEdit,
  onDelete,
  className,
  runSettings,
  runStatus = 'draft',
}: PayrollTableRowProps) {
  const [name, setName] = useState(runItem?.employeeSnapshot?.fullName || '');
  const [role, setRole] = useState(runItem?.employeeSnapshot?.role || '');
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [computationDrawerOpen, setComputationDrawerOpen] = useState(false);
  const [isEditingGross, setIsEditingGross] = useState(false);
  const [grossInputValue, setGrossInputValue] = useState('');
  const [editedMonthlyGross, setEditedMonthlyGross] = useState<number | null>(
    null,
  );
  const grossInputRef = useRef<HTMLInputElement>(null);

  // Get table row data from runItem and computedItem
  const rowData = getTableRowData(runItem, computedItem);

  // Derive monthlyGross from runItem data (always up-to-date, no useEffect needed)
  // Use editedMonthlyGross if we're in the middle of editing
  const monthlyGross = editedMonthlyGross ?? rowData.monthlyGross;

  // Check if editing is disabled (finalized runs)
  const isReadOnly = runStatus === 'final';

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
    // Parse the input value and round to 2 decimal places
    const parsedValue = parseFloat(grossInputValue) || 0;
    const roundedValue = Math.round(parsedValue * 100) / 100;

    // Clear the edited value - it will now derive from runItem data
    setEditedMonthlyGross(null);

    // Calculate annual gross from rounded monthly value
    const annualGross = roundedValue * 12;

    // Get BHT breakdown with precedence (employee > company > system)
    const breakdown = resolveBhtBreakdown(runItem, runSettings);

    // Calculate annualBasic, annualHousing, annualTransport from annualGross using breakdown rates
    const basicRate = breakdown.basic ?? 1.0; // Default to 100% basic if not specified
    const housingRate = breakdown.housing ?? 0;
    const transportRate = breakdown.transport ?? 0;

    const annualBasic = annualGross * basicRate;
    const annualHousing = annualGross * housingRate;
    const annualTransport = annualGross * transportRate;

    const currentComp = runItem.payProfileSnapshot.compensationHistory[0];
    const currentAnnualGross = parseFloat(currentComp.annualGross);
    const newAnnualGrossRounded = Math.round(annualGross * 100) / 100;

    if (newAnnualGrossRounded !== currentAnnualGross) {
      // Update compensation history with calculated BHT breakdown
      onEdit({
        ...runItem,
        payProfileSnapshot: {
          ...runItem.payProfileSnapshot,
          compensationHistory: [
            {
              ...currentComp,
              annualGross: newAnnualGrossRounded.toFixed(2),
              annualBasic: annualBasic.toFixed(2),
              annualHousing:
                annualHousing > 0 ? annualHousing.toFixed(2) : undefined,
              annualTransport:
                annualTransport > 0 ? annualTransport.toFixed(2) : undefined,
            },
          ],
        },
      });
    }
    setIsEditingGross(false);
    setGrossInputValue('');
  };

  const handleGrossFocus = () => {
    // Store the current value in editedMonthlyGross so it doesn't change while editing
    setEditedMonthlyGross(monthlyGross);
    // Initialize input with current value formatted to 2 decimal places
    const formattedValue = monthlyGross === 0 ? '' : monthlyGross.toFixed(2);
    setGrossInputValue(formattedValue);
    setIsEditingGross(true);
    // Select all text when focusing for easy replacement
    setTimeout(() => {
      grossInputRef.current?.select();
    }, 0);
  };

  // Helper to render cell content based on header key
  const renderCell = (header: HeaderConfig) => {
    if (!header.show || !header.visible) return null;

    switch (header.key) {
      case 'employee':
        return (
          <TableCell key={header.key} className={header.className}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              className="border-border/50 bg-background focus-visible:ring-ring focus-visible:border-ring h-8 rounded border p-1.5 font-normal"
              placeholder="Name"
            />
          </TableCell>
        );

      case 'role':
        return (
          <TableCell key={header.key} className={header.className}>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onBlur={handleRoleBlur}
              disabled={isReadOnly}
              placeholder="Role"
              className="border-border/50 bg-background focus-visible:ring-ring focus-visible:border-ring h-8 rounded border p-1.5 font-normal disabled:cursor-not-allowed disabled:opacity-50"
            />
          </TableCell>
        );

      case 'bht':
        return (
          <TableCell
            key={header.key}
            className={`${header.className} hover:bg-muted/10 after:bg-border/40 relative cursor-pointer transition-colors after:absolute after:top-1/2 after:right-0 after:h-3/5 after:w-px after:-translate-y-1/2`}
          >
            <span className="text-muted-foreground tabular-nums">
              {ngnMoneyFormatter.format(
                rowData.monthlyBasic +
                  rowData.monthlyHousing +
                  rowData.monthlyTransport,
              )}
            </span>
          </TableCell>
        );

      case 'gross':
        return (
          <TableCell
            key={header.key}
            className={`${header.className} ${isReadOnly ? '' : 'cursor-pointer'}`}
            onClick={isReadOnly ? undefined : handleGrossFocus}
          >
            {isEditingGross && !isReadOnly ? (
              <Input
                ref={grossInputRef}
                type="text"
                inputMode="numeric"
                autoFocus
                value={grossInputValue}
                onChange={(e) => {
                  // Allow only numbers, decimal point, and empty string
                  const rawValue = e.target.value;
                  // Allow empty string, numbers, and single decimal point
                  if (rawValue === '' || /^\d*\.?\d*$/.test(rawValue)) {
                    setGrossInputValue(rawValue);
                  }
                }}
                onBlur={handleGrossBlur}
                onKeyDown={(e) => {
                  // Allow Enter to blur and save
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                className="border-border/50 bg-background focus-visible:ring-ring focus-visible:border-ring h-8 rounded border p-1.5 text-right font-normal"
              />
            ) : (
              <div
                className={`border-border/50 flex h-8 w-full items-center justify-end rounded border px-2 py-1.5 transition-colors ${
                  isReadOnly
                    ? 'bg-muted/20 opacity-75'
                    : 'hover:border-border hover:bg-muted/30'
                }`}
              >
                <span className="text-muted-foreground tabular-nums">
                  {ngnMoneyFormatter.format(monthlyGross)}
                </span>
              </div>
            )}
          </TableCell>
        );

      case 'paye':
        return (
          <TableCell
            key={header.key}
            className={`${header.className} hover:bg-muted/10 after:bg-border/40 relative cursor-pointer transition-colors after:absolute after:top-1/2 after:right-0 after:h-3/5 after:w-px after:-translate-y-1/2`}
            onClick={() => setComputationDrawerOpen(true)}
          >
            <span className="text-destructive/80 font-mono tracking-wide tabular-nums">
              {rowData.paye != null
                ? ngnMoneyFormatter.format(rowData.paye)
                : '-'}
            </span>
          </TableCell>
        );

      case 'pension':
        return (
          <TableCell
            key={header.key}
            className={`${header.className} hover:bg-muted/10 after:bg-border/40 relative cursor-pointer transition-colors after:absolute after:top-1/2 after:right-0 after:h-3/5 after:w-px after:-translate-y-1/2`}
            onClick={() => setComputationDrawerOpen(true)}
          >
            <span className="tabular-nums">
              {ngnMoneyFormatter.format(rowData.employeePension)}
            </span>
          </TableCell>
        );

      case 'otherDeductions':
        return (
          <TableCell
            key={header.key}
            className={`${header.className} hover:bg-muted/10 cursor-pointer transition-colors`}
            onClick={() => setComputationDrawerOpen(true)}
          >
            <span className="tabular-nums">
              {ngnMoneyFormatter.format(
                (rowData.employeeNhf || 0) + (rowData.employeeNhis || 0),
              )}
            </span>
          </TableCell>
        );

      case 'net':
        return (
          <TableCell
            key={header.key}
            className={`${header.className} cursor-pointer font-medium transition-colors hover:bg-green-100 dark:bg-green-950/20 dark:hover:bg-green-950/30`}
            onClick={() => setComputationDrawerOpen(true)}
          >
            <span className="font-mono text-green-700 tabular-nums dark:text-green-400">
              {ngnMoneyFormatter.format(rowData.netPay)}
            </span>
          </TableCell>
        );

      case 'actions':
        return (
          <TableCell key={header.key} className={header.className}>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive h-8 w-8 hover:bg-transparent"
                onClick={() => onDelete(runItem.id)}
              >
                <Trash2 className="size-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-8 w-4 hover:bg-transparent"
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded">
                  <DropdownMenuItem onClick={() => setDetailsDrawerOpen(true)}>
                    <Eye className="size-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setComputationDrawerOpen(true)}
                  >
                    <Calculator className="size-4" />
                    View Computation
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </TableCell>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <TableRow
        className={cn(
          'group hover:bg-muted/5 border-border/50 border-b transition-colors',
          className,
        )}
      >
        {headers
          .filter((header) => header.show && header.visible)
          .map((header) => renderCell(header))}
      </TableRow>

      {/* View Details Sheet */}
      <Sheet open={detailsDrawerOpen} onOpenChange={setDetailsDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Employee Details</SheetTitle>
            <SheetDescription>
              View and edit employee information and compensation details
            </SheetDescription>
          </SheetHeader>
          <div className="scrollbar-thin-2px space-y-4 overflow-y-auto py-4">
            <div className="">
              <label className="text-muted-foreground text-sm">Full Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Employee name"
                className="rounded text-sm"
              />
            </div>
            <div className="">
              <label className="text-muted-foreground text-sm">
                Role/Position
              </label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                onBlur={handleRoleBlur}
                placeholder="Job title"
                className="rounded text-sm"
              />
            </div>
            <div className="">
              <label className="text-muted-foreground text-sm">
                Monthly Basic Salary
              </label>
              <Input
                type="number"
                value={monthlyGross}
                onChange={(e) => {
                  if (isReadOnly) return;
                  const monthly = parseFloat(e.target.value) || 0;
                  setEditedMonthlyGross(monthly);
                  // Calculate annual gross
                  const annualGross = monthly * 12;
                  // Get BHT breakdown with precedence
                  const breakdown = resolveBhtBreakdown(runItem, runSettings);
                  const basicRate = breakdown.basic ?? 1.0;
                  const housingRate = breakdown.housing ?? 0;
                  const transportRate = breakdown.transport ?? 0;
                  // Calculate BHT components
                  const annualBasic = annualGross * basicRate;
                  const annualHousing = annualGross * housingRate;
                  const annualTransport = annualGross * transportRate;
                  // Update runItem compensation
                  const currentComp =
                    runItem.payProfileSnapshot.compensationHistory[0];
                  onEdit({
                    ...runItem,
                    payProfileSnapshot: {
                      ...runItem.payProfileSnapshot,
                      compensationHistory: [
                        {
                          ...currentComp,
                          annualGross: annualGross.toFixed(2),
                          annualBasic: annualBasic.toFixed(2),
                          annualHousing:
                            annualHousing > 0
                              ? annualHousing.toFixed(2)
                              : undefined,
                          annualTransport:
                            annualTransport > 0
                              ? annualTransport.toFixed(2)
                              : undefined,
                        },
                      ],
                    },
                  });
                }}
                disabled={isReadOnly}
                placeholder="0.00"
                className="rounded text-sm disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            {/* TODO: Add more fields for compensation breakdown, rent, one-offs, etc. */}
          </div>
          <SheetFooter>
            <Button
              onClick={() => {
                handleGrossBlur();
                handleRoleBlur();
                setDetailsDrawerOpen(false);
              }}
            >
              Save Changes
            </Button>
            <Button
              variant="outline"
              onClick={() => setDetailsDrawerOpen(false)}
            >
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* View Computation Sheet */}
      <Sheet
        open={computationDrawerOpen}
        onOpenChange={setComputationDrawerOpen}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Payroll Calculation Details</SheetTitle>
            <SheetDescription>
              Breakdown of {name || 'employee'}'s pay calculation
            </SheetDescription>
          </SheetHeader>
          <div className="scrollbar-thin-2px space-y-4 overflow-y-auto py-4">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Gross Pay</h4>
              <div className="text-muted-foreground space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span>Monthly Gross:</span>
                  <span className="font-medium tabular-nums">
                    {ngnMoneyFormatter.format(rowData.monthlyGross)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Monthly Basic:</span>
                  <span className="font-medium tabular-nums">
                    {ngnMoneyFormatter.format(rowData.monthlyBasic)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Monthly Housing:</span>
                  <span className="font-medium tabular-nums">
                    {ngnMoneyFormatter.format(rowData.monthlyHousing)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Monthly Transport:</span>
                  <span className="font-medium tabular-nums">
                    {ngnMoneyFormatter.format(rowData.monthlyTransport)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Annual Gross:</span>
                  <span className="font-medium tabular-nums">
                    {ngnMoneyFormatter.format(rowData.monthlyGross * 12)}
                  </span>
                </div>
              </div>
            </div>

            {viewMode === 'detailed' && (
              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-semibold">
                  Compensation Breakdown
                </h4>
                <div className="text-muted-foreground space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span>Basic:</span>
                    <span className="font-medium tabular-nums">
                      {ngnMoneyFormatter.format(rowData.monthlyBasic)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Housing:</span>
                    <span className="font-medium tabular-nums">
                      {ngnMoneyFormatter.format(rowData.monthlyHousing)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transport:</span>
                    <span className="font-medium tabular-nums">
                      {ngnMoneyFormatter.format(rowData.monthlyTransport)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-semibold">Deductions</h4>
              <div className="text-muted-foreground space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span>PAYE:</span>
                  <span className="font-medium tabular-nums">
                    {rowData.paye != null
                      ? ngnMoneyFormatter.format(rowData.paye)
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Employee Pension:</span>
                  <span className="font-medium tabular-nums">
                    {ngnMoneyFormatter.format(rowData.employeePension)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>NHF:</span>
                  <span className="font-medium tabular-nums">
                    {rowData.employeeNhf != null
                      ? ngnMoneyFormatter.format(rowData.employeeNhf)
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>NHIS:</span>
                  <span className="font-medium tabular-nums">
                    {rowData.employeeNhis != null
                      ? ngnMoneyFormatter.format(rowData.employeeNhis)
                      : '-'}
                  </span>
                </div>
                {/* Only show "Other Deductions" if there are deductions beyond NHF and NHIS */}
                {rowData.totalDeductions != null &&
                  (rowData.employeeNhf || 0) + (rowData.employeeNhis || 0) <
                    rowData.totalDeductions && (
                    <div className="flex justify-between">
                      <span>Other Deductions:</span>
                      <span className="font-medium tabular-nums">
                        {ngnMoneyFormatter.format(
                          rowData.totalDeductions -
                            (rowData.employeeNhf || 0) -
                            (rowData.employeeNhis || 0) -
                            rowData.employeePension -
                            (rowData.paye || 0),
                        )}
                      </span>
                    </div>
                  )}
                <div className="text-foreground flex justify-between border-t pt-1.5 font-semibold">
                  <span>Total Deductions:</span>
                  <span className="tabular-nums">
                    {rowData.totalDeductions != null
                      ? ngnMoneyFormatter.format(rowData.totalDeductions)
                      : '-'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-semibold">Net Pay</h4>
              <div className="text-lg font-semibold tabular-nums">
                {ngnMoneyFormatter.format(rowData.netPay)}
              </div>
            </div>

            {rowData.employerPension && rowData.employerPension > 0 && (
              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-semibold">
                  Employer Contributions
                </h4>
                <div className="text-muted-foreground space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span>Employer Pension:</span>
                    <span className="font-medium tabular-nums">
                      {ngnMoneyFormatter.format(rowData.employerPension)}
                    </span>
                  </div>
                  {rowData.employerNhis != null && rowData.employerNhis > 0 && (
                    <div className="flex justify-between">
                      <span>Employer NHIS:</span>
                      <span className="font-medium tabular-nums">
                        {ngnMoneyFormatter.format(rowData.employerNhis)}
                      </span>
                    </div>
                  )}
                  <div className="text-foreground flex justify-between border-t pt-1.5 font-semibold">
                    <span>Total Cost to Employer:</span>
                    <span className="tabular-nums">
                      {rowData.employerCost != null
                        ? ngnMoneyFormatter.format(rowData.employerCost)
                        : ngnMoneyFormatter.format(
                            rowData.monthlyGross +
                              rowData.employerPension +
                              (rowData.employerNhis || 0),
                          )}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

const ngnMoneyFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

interface PayrollTableCardProps {
  runItem: PayrollRunItem;
  computedItem?: PayrollComputedItem;
  onEdit: (runItem: PayrollRunItem) => void;
  onDelete: (runItemId: string) => void;
}

export function PayrollTableCard({
  runItem,
  computedItem,
  onEdit,
  onDelete,
}: PayrollTableCardProps) {
  const rowData = getTableRowData(runItem, computedItem);
  const [name, setName] = useState(runItem?.employeeSnapshot?.fullName || '');
  const [role, setRole] = useState(runItem?.employeeSnapshot?.role || '');
  const compHistory = runItem?.payProfileSnapshot?.compensationHistory || [];
  const annualGross =
    compHistory.length > 0 ? parseFloat(compHistory[0].annualGross) : 0;
  const [annualGrossInput, setAnnualGrossInput] = useState(
    annualGross.toString(),
  );

  const monthlyGross = rowData.monthlyGross;
  const computed: MockComputedValues = {
    basic: monthlyGross * 0.6,
    housing: monthlyGross * 0.3,
    transport: monthlyGross * 0.1,
    gross: monthlyGross,
    paye: 12000,
    pension: 25000,
    nhf: 8000,
    nhis: 5000,
    otherDeductions: 0,
    net: 85000,
  };

  const totalDeductions = computed.paye + computed.pension;

  const handleSave = () => {
    // Update runItem with new values
    onEdit({
      ...runItem,
      employeeSnapshot: {
        ...runItem.employeeSnapshot,
        fullName: name,
        role: role || undefined,
      },
    });
  };

  return (
    <>
      <div className="space-y-1 p-4">
        <div className="space-y-2">
          <div className="flex">
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex-1 pr-1">
                <Input
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-7.5 rounded text-[16px]"
                />
              </div>

              <div className="flex gap-1">
                <div className="flex-1">
                  <Input
                    placeholder="Role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="h-7.5 rounded text-[16px]"
                  />
                </div>

                <Drawer repositionInputs={false} fixed>
                  <DrawerTrigger asChild>
                    <div
                      className="bg-muted hover:bg-muted/80 flex w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded rounded-r-none"
                      role="button"
                      tabIndex={0}
                    >
                      <Pencil className="size-4 text-gray-500" />
                    </div>
                  </DrawerTrigger>
                  <DrawerContent className="!max-h-[65vh] !max-w-full !rounded-none">
                    <DrawerHeader>
                      <DrawerTitle>Edit Employee</DrawerTitle>
                      <DrawerDescription>
                        Update employee information and compensation details
                      </DrawerDescription>
                    </DrawerHeader>
                    <div className="scrollbar-thin-2px space-y-4 overflow-y-auto p-4">
                      <div className="">
                        <label className="text-muted-foreground text-sm">
                          Full Name
                        </label>
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Employee name"
                          className="rounded text-base"
                        />
                      </div>
                      <div className="">
                        <label className="text-muted-foreground text-sm">
                          Role/Position
                        </label>
                        <Input
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                          placeholder="Job title"
                          className="rounded text-base"
                        />
                      </div>
                      <div className="">
                        <label className="text-muted-foreground text-sm">
                          Annual Gross Salary
                        </label>
                        <Input
                          type="number"
                          value={annualGrossInput}
                          onChange={(e) => setAnnualGrossInput(e.target.value)}
                          placeholder="0.00"
                          className="rounded text-base"
                        />
                      </div>
                      <div className="">
                        <label className="text-muted-foreground text-sm">
                          Email
                        </label>
                        <Input
                          type="email"
                          value=""
                          placeholder="employee@example.com"
                          disabled
                          className="rounded text-base"
                        />
                      </div>
                      <div className="">
                        <label className="text-muted-foreground text-sm">
                          Staff ID
                        </label>
                        <Input
                          value={runItem?.employeeSnapshot?.employeeId || ''}
                          placeholder="Employee ID"
                          disabled
                          className="rounded text-base"
                        />
                      </div>
                      <div className="">
                        <label className="text-muted-foreground text-sm">
                          Department
                        </label>
                        <Input
                          value={runItem?.employeeSnapshot?.department || ''}
                          placeholder="Department"
                          disabled
                          className="rounded text-base"
                        />
                      </div>
                    </div>
                    <DrawerFooter>
                      <Button onClick={handleSave}>Save Changes</Button>
                      <DrawerClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DrawerClose>
                    </DrawerFooter>
                  </DrawerContent>
                </Drawer>
              </div>
            </div>

            <div className="bg-muted flex w-8 flex-shrink-0 flex-col items-center justify-between gap-2 rounded rounded-bl-none py-2 pt-3">
              <div
                className="cursor-pointer hover:opacity-80"
                onClick={() => onDelete(runItem.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onDelete(runItem.id);
                  }
                }}
              >
                <Trash2 className="size-4 text-red-500" />
              </div>
              <Drawer>
                <DrawerTrigger asChild>
                  <div
                    className="cursor-pointer hover:opacity-80"
                    role="button"
                    tabIndex={0}
                  >
                    <Eye className="size-4 text-gray-500" />
                  </div>
                </DrawerTrigger>
                <DrawerContent className="max-h-[60vh]">
                  <DrawerHeader>
                    <DrawerTitle>Payroll Calculation Details</DrawerTitle>
                    <DrawerDescription>
                      Breakdown of {name || 'employee'}'s pay calculation
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="space-y-4 overflow-y-auto p-4">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold">Gross Pay</h4>
                      <div className="text-muted-foreground space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span>Annual Gross:</span>
                          <span className="font-medium tabular-nums">
                            {ngnMoneyFormatter.format(Number(annualGross) || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Monthly Gross:</span>
                          <span className="font-medium tabular-nums">
                            {ngnMoneyFormatter.format(
                              (Number(annualGross) || 0) / 12,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 border-t pt-4">
                      <h4 className="text-sm font-semibold">Deductions</h4>
                      <div className="text-muted-foreground space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span>PAYE:</span>
                          <span className="font-medium tabular-nums">
                            {ngnMoneyFormatter.format(computed.paye)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Pension:</span>
                          <span className="font-medium tabular-nums">
                            {ngnMoneyFormatter.format(computed.pension)}
                          </span>
                        </div>
                        <div className="text-foreground flex justify-between border-t pt-1.5 font-semibold">
                          <span>Total Deductions:</span>
                          <span className="tabular-nums">
                            {ngnMoneyFormatter.format(totalDeductions)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 border-t pt-4">
                      <h4 className="text-sm font-semibold">Net Pay</h4>
                      <div className="text-lg font-semibold tabular-nums">
                        {ngnMoneyFormatter.format(computed.net)}
                      </div>
                    </div>
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="grid grid-cols-2 gap-2">
            {/* annual gross */}
            <div className="flex flex-col">
              <label
                htmlFor={`annual-gross-${runItem.id}`}
                className="text-muted-foreground text-xs font-medium"
              >
                Annual Gross
              </label>
              <Input
                id={`annual-gross-${runItem.id}`}
                type="number"
                placeholder="0.00"
                value={annualGrossInput}
                onChange={(e) => setAnnualGrossInput(e.target.value)}
                className="h-7.5 rounded text-base"
              />
            </div>
            {/* computed net pay */}
            <div className="flex flex-col text-right text-green-600">
              <span className="text-muted-foreground text-xs font-medium">
                Net Pay
              </span>
              <div className="text-right font-mono text-lg font-semibold tabular-nums">
                {ngnMoneyFormatter.format(computed.net)}
              </div>
            </div>
          </div>
          <div className="bg-muted text-muted-foreground flex w-full flex-nowrap justify-between gap-1 rounded p-1 text-xs *:truncate">
            <span title={`PAYE: ${ngnMoneyFormatter.format(computed.paye)}`}>
              PAYE: {ngnMoneyFormatter.format(computed.paye)}
            </span>
            <span
              title={`Pension: ${ngnMoneyFormatter.format(computed.pension)}`}
            >
              Pension: {ngnMoneyFormatter.format(computed.pension)}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
