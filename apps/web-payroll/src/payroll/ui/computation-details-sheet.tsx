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
  Calculator,
  ChevronDown,
  CreditCard,
  // Landmark,
  // PiggyBank,
  TrendingDown,
  Wallet,
} from 'lucide-react';

import { ngnMoneyFormatter } from './payroll-table-utils';

import type { PayrollComputedItem } from '../domain';
import type { TableRowData } from './payroll-table-utils';

interface ComputationDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowData: TableRowData;
  computedItem?: PayrollComputedItem;
  employeeName: string;
  side?: 'left' | 'right' | 'top' | 'bottom';
  showCompensationBreakdown?: boolean;
  showOtherDeductions?: boolean;
}

export function ComputationDetailsSheet({
  open,
  onOpenChange,
  rowData,
  computedItem,
  employeeName,
  side = 'right',
  // showCompensationBreakdown = false,
  showOtherDeductions = false,
}: ComputationDetailsSheetProps) {
  const [isEmployerCostOpen, setIsEmployerCostOpen] = useState(false);
  const [isPayeDetailsOpen, setIsPayeDetailsOpen] = useState(false);
  const sheetClassName =
    side === 'bottom' ? 'max-h-[85vh]' : 'w-full sm:max-w-lg';

  const moneyToNumber = (value?: string | null) => {
    if (value == null) return undefined;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const formatPlainNumber = (value: number) =>
    new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(value);

  const formatRateLabel = (value: number) =>
    `${(value * 100).toFixed(0)}% rate`;

  const DetailRow = ({
    label,
    value,
    className,
    valueClassName,
    formatValue,
  }: {
    label: string;
    value: string | number | null | undefined;
    className?: string;
    valueClassName?: string;
    formatValue?: (value: number) => string;
  }) => (
    <div className={cn('flex justify-between py-1', className)}>
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className={cn('text-sm font-medium tabular-nums', valueClassName)}>
        {typeof value === 'number'
          ? formatValue
            ? formatValue(value)
            : ngnMoneyFormatter(value, 2)
          : (value ?? '-')}
      </span>
    </div>
  );

  const taxBreakdown = computedItem?.taxBreakdown;
  const taxCalculation = taxBreakdown?.taxCalculation;
  const annualizedGross =
    taxBreakdown?.usedYtd && taxBreakdown?.ytd
      ? moneyToNumber(taxBreakdown.ytd.projectedAnnualGross)
      : rowData.monthlyGross * 12;
  const allowableDeductionsTotal = moneyToNumber(
    taxBreakdown?.allowableDeductions.total,
  );
  const annualRent = moneyToNumber(taxBreakdown?.rentRelief.annualRent);
  const rentRelief = moneyToNumber(taxBreakdown?.rentRelief.reliefAmount);
  const annualTaxableIncome = moneyToNumber(
    taxCalculation?.annualTaxableIncome,
  );
  const annualTax = moneyToNumber(taxCalculation?.annualTax);
  const taxDueYtd = moneyToNumber(taxCalculation?.taxDueYtd);
  const taxWithheldYtd = moneyToNumber(taxCalculation?.taxWithheldYtd);
  const currentMonthPaye = moneyToNumber(taxCalculation?.currentMonthPaye);

  const allowableStatutory = taxBreakdown?.allowableDeductions.statutory;
  const allowableVoluntaryRecurring =
    taxBreakdown?.allowableDeductions.voluntaryRecurring;
  const allowableVoluntaryOneOff =
    taxBreakdown?.allowableDeductions.voluntaryOneOff;
  const isPositiveMoney = (value?: string | null) => {
    const parsed = moneyToNumber(value);
    return parsed != null && parsed > 0 ? parsed : undefined;
  };

  const statutoryEntries = allowableStatutory
    ? [
        {
          label: 'Statutory pension',
          value: isPositiveMoney(allowableStatutory.pension),
        },
        {
          label: 'Statutory NHF',
          value: isPositiveMoney(allowableStatutory.nhf),
        },
        {
          label: 'Statutory NHIS',
          value: isPositiveMoney(allowableStatutory.nhis),
        },
      ].filter((entry) => entry.value != null)
    : [];
  const voluntaryRecurringEntries = allowableVoluntaryRecurring
    ? [
        {
          label: 'Voluntary pension (recurring)',
          value: isPositiveMoney(allowableVoluntaryRecurring.pension),
        },
        {
          label: 'Voluntary NHF (recurring)',
          value: isPositiveMoney(allowableVoluntaryRecurring.nhf),
        },
        {
          label: 'Voluntary NHIS (recurring)',
          value: isPositiveMoney(allowableVoluntaryRecurring.nhis),
        },
        {
          label: 'Mortgage interest (recurring)',
          value: isPositiveMoney(
            allowableVoluntaryRecurring.ownerOccupiedMortgageInterest,
          ),
        },
        {
          label: 'Life insurance (recurring)',
          value: isPositiveMoney(
            allowableVoluntaryRecurring.lifeInsurancePremium,
          ),
        },
      ].filter((entry) => entry.value != null)
    : [];
  const voluntaryOneOffEntries = allowableVoluntaryOneOff
    ? [
        {
          label: 'Voluntary pension (one-off)',
          value: isPositiveMoney(allowableVoluntaryOneOff.pension),
        },
        {
          label: 'Voluntary NHF (one-off)',
          value: isPositiveMoney(allowableVoluntaryOneOff.nhf),
        },
        {
          label: 'Voluntary NHIS (one-off)',
          value: isPositiveMoney(allowableVoluntaryOneOff.nhis),
        },
        {
          label: 'Mortgage interest (one-off)',
          value: isPositiveMoney(
            allowableVoluntaryOneOff.ownerOccupiedMortgageInterest,
          ),
        },
        {
          label: 'Life insurance (one-off)',
          value: isPositiveMoney(allowableVoluntaryOneOff.lifeInsurancePremium),
        },
      ].filter((entry) => entry.value != null)
    : [];
  const hasAllowableBreakdown =
    statutoryEntries.length > 0 ||
    voluntaryRecurringEntries.length > 0 ||
    voluntaryOneOffEntries.length > 0;

  const taxBandBreakdownEntries =
    taxBreakdown?.taxBandBreakdown?.map((band) => ({
      label: band.label,
      rate: band.rate,
      taxableAmount: moneyToNumber(band.taxableAmount),
      taxAmount: moneyToNumber(band.taxAmount),
    })) ?? [];
  const hasTaxBandBreakdown = taxBandBreakdownEntries.length > 0;

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

          <div className="bg-muted/10 flex flex-1 touch-pan-y flex-col overflow-y-auto">
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
                <div className="bg-card flex flex-col rounded border">
                  <div className="flex flex-col p-4 pb-2">
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
                <div className="bg-card flex flex-col rounded border">
                  <div className="flex flex-col p-4 pb-1">
                    <DetailRow label="PAYE Tax" value={rowData.paye} />
                    <DetailRow
                      label="Pension (Employee)"
                      value={rowData.employeePension}
                    />
                    <DetailRow label="NHF" value={rowData.employeeNhf} />
                    <DetailRow label="NHIS" value={rowData.employeeNhis} />

                    {showOtherDeductions &&
                      rowData.totalDeductions != null &&
                      (rowData.employeePension || 0) +
                        (rowData.employeeNhf || 0) +
                        (rowData.employeeNhis || 0) <
                        rowData.totalDeductions && (
                        <DetailRow
                          label="Other Deductions"
                          value={
                            rowData.totalDeductions -
                            (rowData.employeePension || 0) -
                            (rowData.employeeNhf || 0) -
                            (rowData.employeeNhis || 0)
                          }
                        />
                      )}
                  </div>

                  <div className="flex items-center justify-between border-t px-4 py-2">
                    <span className="text-sm font-semibold">
                      Total Deductions
                    </span>
                    <span className="font-bold text-rose-600 tabular-nums dark:text-rose-400">
                      {(() => {
                        // Total deductions includes PAYE + all other deductions
                        const paye = rowData.paye || 0;
                        const otherDeductions = rowData.totalDeductions || 0;
                        const total = paye + otherDeductions;
                        return total > 0 ? ngnMoneyFormatter(total, 2) : '-';
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* PAYE Computation Details */}
              {taxBreakdown && (
                <Collapsible
                  open={isPayeDetailsOpen}
                  onOpenChange={setIsPayeDetailsOpen}
                  className="space-y-2"
                >
                  <CollapsibleTrigger asChild>
                    <button className="bg-muted/30 hover:bg-muted/50 group flex w-full items-center justify-between rounded border p-3 transition-colors">
                      <div className="flex items-center gap-2">
                        <Calculator className="text-muted-foreground group-hover:text-foreground h-4 w-4 transition-colors" />
                        <span className="text-muted-foreground group-hover:text-foreground text-sm font-medium transition-colors">
                          PAYE computation
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground group-hover:text-foreground text-sm font-semibold tabular-nums">
                          {currentMonthPaye != null
                            ? ngnMoneyFormatter(currentMonthPaye, 2)
                            : rowData.paye != null
                              ? ngnMoneyFormatter(rowData.paye, 2)
                              : '-'}
                        </span>
                        <ChevronDown
                          className={cn(
                            'text-muted-foreground h-4 w-4 transition-transform duration-200',
                            isPayeDetailsOpen && 'rotate-180',
                          )}
                        />
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 px-1">
                    <div className="bg-card space-y-3 rounded border p-4 text-sm shadow-sm">
                      <div className="text-muted-foreground text-xs leading-relaxed">
                        {taxBreakdown.usedYtd
                          ? 'PAYE is computed using cumulative YTD: tax due to date minus tax already withheld.'
                          : 'PAYE is computed from annualized income (annual tax divided by 12).'}
                      </div>
                      <div className="space-y-1">
                        <DetailRow
                          label={
                            taxBreakdown.usedYtd
                              ? 'Projected annual gross'
                              : 'Annualized gross'
                          }
                          value={annualizedGross}
                        />
                        <DetailRow
                          label="Allowable deductions (annual)"
                          value={allowableDeductionsTotal}
                        />
                        <DetailRow label="Annual rent" value={annualRent} />
                        <DetailRow
                          label="Rent relief (annual)"
                          value={
                            taxBreakdown.rentRelief.applied
                              ? rentRelief
                              : 'Not applied'
                          }
                        />
                        <DetailRow
                          label="Annual taxable income"
                          value={annualTaxableIncome}
                          valueClassName="text-base font-semibold"
                        />
                        <DetailRow label="Annual tax" value={annualTax} />
                        {taxBreakdown.usedYtd && (
                          <>
                            <DetailRow label="Tax due YTD" value={taxDueYtd} />
                            <DetailRow
                              label="Tax withheld YTD"
                              value={taxWithheldYtd}
                            />
                            <DetailRow
                              label="Worked months"
                              value={taxBreakdown.ytd?.workedMonthUnits}
                              formatValue={formatPlainNumber}
                            />
                          </>
                        )}
                        <DetailRow
                          label="Current month PAYE"
                          value={currentMonthPaye ?? rowData.paye}
                          valueClassName="text-rose-600 dark:text-rose-400 text-base font-semibold"
                        />
                      </div>

                      {hasTaxBandBreakdown && (
                        <div className="border-t pt-3">
                          <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                            Tax band detail
                          </div>
                          <div className="text-muted-foreground mt-2 grid text-xs font-semibold sm:grid-cols-[2fr_1fr_1fr]">
                            <span>Band</span>
                            <span className="text-right">Taxable</span>
                            <span className="text-right">Tax</span>
                          </div>
                          <div className="text-foreground mt-2 space-y-2 text-sm">
                            {taxBandBreakdownEntries.map((band) => (
                              <div
                                key={`${band.label}-${band.rate}`}
                                className="grid items-center gap-2 text-xs sm:grid-cols-[2fr_1fr_1fr]"
                              >
                                <div>
                                  <div className="text-foreground font-medium">
                                    {band.label}
                                  </div>
                                  <div className="text-muted-foreground text-[11px]">
                                    {formatRateLabel(band.rate)}
                                  </div>
                                </div>
                                <div className="text-right font-semibold">
                                  {band.taxableAmount != null
                                    ? ngnMoneyFormatter(band.taxableAmount, 2)
                                    : '-'}
                                </div>
                                <div className="text-right font-semibold text-rose-600 dark:text-rose-400">
                                  {band.taxAmount != null
                                    ? ngnMoneyFormatter(band.taxAmount, 2)
                                    : '-'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {hasAllowableBreakdown && (
                        <div className="border-t pt-3">
                          <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                            Allowable deductions breakdown
                          </div>
                          <div className="mt-2 space-y-1">
                            {statutoryEntries.map((entry) => (
                              <DetailRow
                                key={entry.label}
                                label={entry.label}
                                value={entry.value}
                              />
                            ))}
                            {voluntaryRecurringEntries.map((entry) => (
                              <DetailRow
                                key={entry.label}
                                label={entry.label}
                                value={entry.value}
                              />
                            ))}
                            {voluntaryOneOffEntries.map((entry) => (
                              <DetailRow
                                key={entry.label}
                                label={entry.label}
                                value={entry.value}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

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
