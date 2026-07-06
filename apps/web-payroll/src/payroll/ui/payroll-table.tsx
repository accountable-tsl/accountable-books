import type { z } from 'zod';
import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
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
  Plus,
  Search,
  Trash2,
} from 'lucide-react';

import { PayrollComputedItemSchema } from '../domain';
import { ComputationDetailsSheet } from './computation-details-sheet';
import { getEmployeeComputationNotes } from './employee-computation-notes';
import { EmployeeComputationNotesIndicator } from './employee-computation-notes-indicator';
import {
  PayrollTableCard,
  usePayrollEmployeeEditor,
} from './payroll-table-card';
import { ngnMoneyFormatter } from './payroll-table-utils';

import type { PayrollRunItem } from '../domain';

type PayrollComputedItem = z.infer<typeof PayrollComputedItemSchema>;

interface PayrollTableProps {
  runItems: PayrollRunItem[];
  computedItems?: PayrollComputedItem[];
  onEdit: (runItem: PayrollRunItem) => void;
  onDelete: (runItemId: string) => void;
  onAdd: () => void;
  viewMode: 'standard' | 'detailed';
  runStatus?: 'draft' | 'final'; // Run status to determine if editing is allowed
  runPeriod?: {
    month: number;
    year: number;
    endMonth?: number;
    endYear?: number;
  };
  finalizedPeriodKeys?: string[];
}
export function PayrollTable({
  runItems = [],
  computedItems = [],
  onEdit,
  onDelete,
  onAdd,
  viewMode,
  runStatus = 'draft',
  runPeriod,
  finalizedPeriodKeys = [],
}: Readonly<PayrollTableProps>) {
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
      className: 'min-w-[100px] text-right text-red-500',
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
      className:
        'text-right bg-green-50 dark:bg-transparent dark:text-green-500 min-w-[110px]',
      show: true,
      visible: true,
    }, // Net pay for the current month
    { key: 'actions', label: '', className: 'w-12', show: true, visible: true }, // Actions column
  ];

  return (
    <div className="flex-1 md:flex md:min-h-0 md:flex-col">
      <div className="border-b py-2 pr-4 md:flex md:items-center md:justify-between">
        <div className="pl-4 text-sm font-medium md:hidden">
          Staff List ({runItems.length})
        </div>

        <div className="relative hidden max-w-sm md:block">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name..."
            className="h-8 rounded border-none pl-9 shadow-none dark:bg-transparent"
          />
        </div>
        <Button
          size="sm"
          className="hidden rounded md:flex"
          onClick={onAdd}
          disabled={runStatus === 'final'}
          variant="ghost"
        >
          <Plus className="size-4" />
          <span>Add Employee</span>
        </Button>
      </div>
      {/* Mobile View Cards */}
      <div className="md:hidden">
        <div className="divide-border divide-y">
          {runItems.map((item) => (
            <PayrollTableCard
              key={item.id}
              runItem={item}
              computedItem={computedItemsMap.get(item.id)}
              onEdit={onEdit}
              onDelete={onDelete}
              runStatus={runStatus}
              runPeriod={runPeriod}
              finalizedPeriodKeys={finalizedPeriodKeys}
            />
          ))}
        </div>
      </div>

      {/* Desktop View */}
      <div className="relative hidden md:flex md:min-h-0 md:flex-col">
        <Table
          ref={tableContainerRef}
          tableContainerClassName="min-h-0 overflow-auto scrollbar-thin-2px"
        >
          <TableHeader className="bg-muted sticky top-0 z-50">
            <TableRow className="bg-muted/30 hover:bg-muted/30 md:bg-muted text-[11px] tracking-wider uppercase">
              {headers
                .filter((header) => header.show && header.visible)
                .map((header) => (
                  <TableHead key={header.key} className={header.className}>
                    {header.label}
                  </TableHead>
                ))}
            </TableRow>
          </TableHeader>
          <TableBody
            className={cn(
              runStatus === 'final' &&
                'pointer-events-none relative opacity-60 grayscale filter select-none',
            )}
          >
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
                      runStatus={runStatus}
                      runPeriod={runPeriod}
                      finalizedPeriodKeys={finalizedPeriodKeys}
                    />
                  );
                })}
              </>
            )}
          </TableBody>
        </Table>
        {runStatus === 'final' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[1px]">
            <div className="text-md absolute rounded bg-red-50/80 px-6 py-2 font-medium text-red-500 shadow-sm">
              Finalized
            </div>
          </div>
        )}
      </div>
    </div>
  );
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
  runStatus?: 'draft' | 'final'; // Run status to determine if editing is allowed
  runPeriod?: PayrollTableProps['runPeriod'];
  finalizedPeriodKeys?: string[];
}

function PayrollTableRow({
  runItem,
  computedItem,
  viewMode,
  headers,
  onEdit,
  onDelete,
  className,
  runStatus = 'draft',
  runPeriod,
  finalizedPeriodKeys = [],
}: Readonly<PayrollTableRowProps>) {
  const editor = usePayrollEmployeeEditor({
    runItem,
    computedItem,
    onEdit,
    runStatus,
    runPeriod,
    finalizedPeriodKeys,
  });

  const {
    rowData,
    isReadOnly,
    name,
    setName,
    role,
    setRole,
    commitEmployeeEdits,
    detailsDrawerOpen,
    setDetailsDrawerOpen,
    handleDetailsDrawerOpenChange,
    computationDrawerOpen,
    setComputationDrawerOpen,
    isEditingGross,
    grossInputValue,
    setGrossInputValue,
    grossInputRef,
    handleGrossBlur,
    handleGrossFocus,
    monthlyGross,
    renderDetailsPanel,
  } = editor;

  const computationNotes = useMemo(
    () => getEmployeeComputationNotes({ runItem, computedItem }),
    [runItem, computedItem],
  );

  // Helper to render cell content based on header key
  const renderCell = (header: HeaderConfig) => {
    if (!header.show || !header.visible) return null;

    switch (header.key) {
      case 'employee':
        return (
          <TableCell key={header.key} className={header.className}>
            <div className="flex items-center gap-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitEmployeeEdits}
                disabled={isReadOnly}
                className="border-border/50 bg-background focus-visible:ring-ring focus-visible:border-ring h-8 min-w-0 flex-1 rounded border p-1.5 font-normal disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Name"
              />
              <EmployeeComputationNotesIndicator notes={computationNotes} />
            </div>
          </TableCell>
        );

      case 'role':
        return (
          <TableCell key={header.key} className={header.className}>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onBlur={commitEmployeeEdits}
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
              {ngnMoneyFormatter(
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
                  {ngnMoneyFormatter(monthlyGross)}
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
              {rowData.paye == null ? '-' : ngnMoneyFormatter(rowData.paye)}
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
              {ngnMoneyFormatter(rowData.employeePension)}
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
              {ngnMoneyFormatter(
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
              {ngnMoneyFormatter(rowData.netPay)}
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
                className="text-destructive hover:text-destructive h-8 w-8 hover:bg-transparent disabled:opacity-30"
                onClick={() => onDelete(runItem.id)}
                disabled={isReadOnly}
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
                    View employee details
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
      <Sheet
        open={detailsDrawerOpen}
        onOpenChange={handleDetailsDrawerOpenChange}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg">
          {renderDetailsPanel('sheet')}
        </SheetContent>
      </Sheet>

      {/* View Computation Sheet */}
      <ComputationDetailsSheet
        open={computationDrawerOpen}
        onOpenChange={setComputationDrawerOpen}
        rowData={rowData}
        computedItem={computedItem}
        employeeName={name}
        side="right"
        showCompensationBreakdown={viewMode === 'detailed'}
        showOtherDeductions={true}
      />
    </>
  );
}
