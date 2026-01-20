import { useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  Building2,
  ChevronDown,
  CreditCard,
  // Landmark,
  // PiggyBank,
  TrendingDown,
  Wallet,
} from 'lucide-react';

import { ngnMoneyFormatter } from './payroll-table-utils';

import type { TableRowData } from './payroll-table-utils';

interface ComputationDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowData: TableRowData;
  employeeName: string;
  side?: 'left' | 'right' | 'top' | 'bottom';
  showCompensationBreakdown?: boolean;
  showOtherDeductions?: boolean;
}

export function ComputationDetailsSheet({
  open,
  onOpenChange,
  rowData,
  employeeName,
  side = 'right',
  // showCompensationBreakdown = false,
  showOtherDeductions = false,
}: ComputationDetailsSheetProps) {
  const [isEmployerCostOpen, setIsEmployerCostOpen] = useState(false);
  const sheetClassName =
    side === 'bottom' ? 'max-h-[85vh]' : 'w-full sm:max-w-lg';

  const DetailRow = ({
    label,
    value,
    className,
    valueClassName,
  }: {
    label: string;
    value: string | number | null | undefined;
    className?: string;
    valueClassName?: string;
  }) => (
    <div className={cn('flex justify-between py-1', className)}>
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className={cn('text-sm font-medium tabular-nums', valueClassName)}>
        {typeof value === 'number'
          ? ngnMoneyFormatter(value, 2)
          : (value ?? '-')}
      </span>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={cn('p-0', sheetClassName)}>
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>Payroll Calculation Details</SheetTitle>
            <SheetDescription>
              Breakdown for{' '}
              <span className="text-foreground font-medium">
                {employeeName || 'employee'}
              </span>
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col bg-muted/10 flex-1 overflow-y-auto touch-pan-y">
            <div className="space-y-4 p-4 sm:p-6">
              {/* Net Pay Hero Card */}
              <div className="bg-card rounded border p-4 shadow-sm">
                <div className="text-muted-foreground flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  <div className="text-sm font-medium tracking-wider uppercase">
                    Net Pay
                  </div>
                </div>
                <div className="text-foreground t text-2xl font-bold tabular-nums">
                  {ngnMoneyFormatter(rowData.netPay, 2)}
                </div>
              </div>

              {/* Income Section */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-1">
                  <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
                  <div className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">
                    Earnings
                  </div>
                </div>
                <div className="flex flex-col bg-card rounded border">
                  <div className="p-4 pb-2 flex flex-col">
                    <DetailRow
                      label="Basic Salary"
                      value={rowData.monthlyBasic}
                    />
                    <DetailRow
                      label="Housing Allowance"
                      value={rowData.monthlyHousing}
                    />
                    <DetailRow
                      label="Transport Allowance"
                      value={rowData.monthlyTransport}
                    />
                    {/* <DetailRow
                      label="Transport Allowance"
                      value={rowData.otherAllowances}
                    /> */}
                  </div>

                  <div className="flex flex-col border-t px-4 py-2">
                    <div className="bg-muted/20">
                      <DetailRow
                        label="Monthly Gross"
                        value={rowData.monthlyGross}
                        className=""
                        valueClassName="text-base font-semibold"
                      />

                      <div className="flex hidden justify-between text-xs">
                        <span className="text-muted-foreground">YTD Gross</span>
                        <span className="tabular-nums">
                          {ngnMoneyFormatter(rowData.monthlyGross * 12, 2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Deductions Section */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-1">
                  <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-500" />
                  <div className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">
                    Deductions
                  </div>
                </div>
                <div className="flex flex-col bg-card rounded border">
                  <div className="p-4 pb-1 flex flex-col">
                    <DetailRow label="PAYE Tax" value={rowData.paye} />
                    <DetailRow
                      label="Pension (Employee)"
                      value={rowData.employeePension}
                    />
                    <DetailRow label="NHF" value={rowData.employeeNhf} />
                    <DetailRow label="NHIS" value={rowData.employeeNhis} />

                    {showOtherDeductions &&
                      rowData.totalDeductions != null &&
                      (rowData.employeeNhf || 0) + (rowData.employeeNhis || 0) <
                        rowData.totalDeductions && (
                        <DetailRow
                          label="Other Deductions"
                          value={
                            rowData.totalDeductions -
                            (rowData.employeeNhf || 0) -
                            (rowData.employeeNhis || 0) -
                            rowData.employeePension -
                            (rowData.paye || 0)
                          }
                        />
                      )}
                  </div>

                  <div className="flex items-center justify-between border-t px-4 py-2">
                    <span className="text-sm font-semibold">
                      Total Deductions
                    </span>
                    <span className="font-bold text-rose-600 tabular-nums dark:text-rose-400">
                      {rowData.totalDeductions != null
                        ? ngnMoneyFormatter(rowData.totalDeductions, 2)
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Employer Cost (Collapsible) */}
              {rowData.employerPension && rowData.employerPension > 0 && (
                <Collapsible
                  open={isEmployerCostOpen}
                  onOpenChange={setIsEmployerCostOpen}
                  className="space-y-2"
                >
                  <CollapsibleTrigger asChild>
                    <button className="bg-muted/30 hover:bg-muted/50 group flex w-full items-center justify-between rounded border p-3 transition-colors">
                      <div className="flex items-center gap-2">
                        <Building2 className="text-muted-foreground group-hover:text-foreground h-4 w-4 transition-colors" />
                        <span className="text-muted-foreground group-hover:text-foreground text-sm font-medium transition-colors">
                          Cost to Employer
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground group-hover:text-foreground text-sm font-semibold tabular-nums">
                          {rowData.employerCost != null
                            ? ngnMoneyFormatter(rowData.employerCost, 2)
                            : ngnMoneyFormatter(
                                rowData.monthlyGross +
                                  rowData.employerPension +
                                  (rowData.employerNhis || 0),
                                2,
                              )}
                        </span>
                        <ChevronDown
                          className={cn(
                            'text-muted-foreground h-4 w-4 transition-transform duration-200',
                            isEmployerCostOpen && 'rotate-180',
                          )}
                        />
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 px-1">
                    <div className="bg-card space-y- rounded border p-4 text-sm shadow-sm">
                      <div className="text-muted-foreground mb-3 flex items-center gap-2 border-b pb-2">
                        <p className="text-xs leading-relaxed">
                          These are contributions made by the company on behalf
                          of the employee, over and above the gross salary.
                        </p>
                      </div>
                      <DetailRow
                        label="Employer Pension"
                        value={rowData.employerPension}
                      />
                      {rowData.employerNhis != null &&
                        rowData.employerNhis > 0 && (
                          <DetailRow
                            label="Employer NHIS"
                            value={rowData.employerNhis}
                          />
                        )}
                      <DetailRow
                        label="Gross Salary"
                        value={rowData.monthlyGross}
                        className=""
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
