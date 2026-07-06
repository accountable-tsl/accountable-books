/**
 * Excel (.xlsx) export for payroll runs.
 *
 * Hybrid model: legally complex amounts (PAYE, pension, NHF, NHIS) are written
 * as values straight from the compute engine; transparent rollups (gross,
 * total deductions, net pay, employer cost, totals, per-band tax) are written
 * as live formulas so accountants can trace the arithmetic.
 *
 * Rules the template follows:
 * - No tax law in the template: formulas only do arithmetic over cells this
 *   exporter wrote from engine output. Tax band rates are written once (PAYE
 *   Detail sheet) and referenced absolutely — never repeated per employee.
 * - Every formula cell carries the engine's number as its cached result, and
 *   is only emitted when the referenced cells actually reconcile with the
 *   engine value (manual overrides can decouple them); otherwise the cell is
 *   written as a plain value. The file never contains a formula that would
 *   recalculate to something other than what the engine computed.
 */
import type { Cell, Workbook, Worksheet } from 'exceljs';

import { getTaxBands } from '../compute/compute-paye';
import { COMPANY_DEFAULTS } from '../data/company-defaults';
import { formatStatutorySummary } from '../ui/employee-computation-notes';
import { getPeriodEndKey, getPeriodStartKey, isMultiPeriodRun } from '../utils';
import { downloadBlob } from './download';

import type {
  PayrollComputedItem,
  PayrollComputedRun,
  PayrollRun,
  PayrollRunItem,
} from '../domain';

const MONEY_FMT = '#,##0.00';
const INT_FMT = '#,##0';
const PAYE_DETAIL_SHEET = 'PAYE Detail';
const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF3F4F6' },
} as const;

/** Tolerance for "do these engine numbers reconcile" checks (below display precision). */
const EPSILON = 0.005;

function money(value: string | undefined | null): number {
  return value ? Number.parseFloat(value) : 0;
}

function sumAmounts(items: Array<{ amount: string }> | undefined): number {
  return items?.reduce((sum, item) => sum + money(item.amount), 0) ?? 0;
}

/** 1-based column index → Excel letter (1 → A, 27 → AA). */
function colLetter(index: number): string {
  let n = index;
  let letters = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/**
 * Write a rollup cell: a live formula when the engine's own numbers reconcile
 * with it, otherwise the engine value alone (e.g. when a manual override
 * decoupled the total from its parts).
 */
function setRollupCell(
  cell: Cell,
  formula: string,
  engineValue: number,
  expectedFromParts: number,
): void {
  if (Math.abs(expectedFromParts - engineValue) < EPSILON) {
    cell.value = { formula, result: engineValue };
  } else {
    cell.value = engineValue;
  }
  cell.numFmt = MONEY_FMT;
}

function setMoney(cell: Cell, value: number): void {
  cell.value = value;
  cell.numFmt = MONEY_FMT;
}

function setBandRate(cell: Cell, rate: number): void {
  cell.value = rate;
  // `0.##%` renders as "0.%" for a zero rate; use an explicit zero pattern.
  cell.numFmt = rate === 0 ? '0%' : '0.0%';
}

/** Cross-sheet or other refs that always mirror the engine value. */
function setLinkedCell(cell: Cell, formula: string, engineValue: number): void {
  cell.value = { formula, result: engineValue };
  cell.numFmt = MONEY_FMT;
}

function styleHeaderRow(
  sheet: Worksheet,
  rowNumber: number,
  options?: { leftAlignedCols?: number[] },
): void {
  const leftAligned = new Set(options?.leftAlignedCols ?? [1]);
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true };
  row.eachCell((cell, colNumber) => {
    cell.fill = { ...HEADER_FILL };
    cell.alignment = {
      horizontal: leftAligned.has(colNumber) ? 'left' : 'right',
      vertical: 'middle',
    };
  });
}

function setMoneyColumnAlignment(sheet: Worksheet, col: number): void {
  sheet.getColumn(col).alignment = { horizontal: 'right', vertical: 'middle' };
}

function periodLabel(run: PayrollRun): string {
  const start = getPeriodStartKey(run);
  return isMultiPeriodRun(run) ? `${start} → ${getPeriodEndKey(run)}` : start;
}

interface SummaryRowInput {
  runItem: PayrollRunItem;
  computedItem: PayrollComputedItem | undefined;
}

const SUMMARY_COLUMNS = [
  { header: 'Employee Name', width: 28 },
  { header: 'Role', width: 16 },
  { header: 'Monthly Basic', width: 14 },
  { header: 'Monthly Housing', width: 14 },
  { header: 'Monthly Transport', width: 15 },
  { header: 'Monthly Gross', width: 14 },
  { header: 'One-off Allowances (taxable)', width: 16 },
  { header: 'PAYE', width: 13 },
  { header: 'EE Pension', width: 13 },
  { header: 'EE NHF', width: 12 },
  { header: 'EE NHIS', width: 12 },
  { header: 'Recurring Deductions', width: 14 },
  { header: 'One-off Deductions', width: 14 },
  { header: 'Total Deductions', width: 15 },
  { header: 'Net Pay', width: 14 },
  { header: 'ER Pension', width: 13 },
  { header: 'ER NHIS', width: 12 },
  { header: 'One-off ER Contributions', width: 15 },
  { header: 'Employer Cost', width: 14 },
] as const;

interface PayeSheetGeometry {
  bandsHeaderRow: number;
  employeeHeaderRow: number;
  firstTaxableCol: number;
  bandCount: number;
  monthlyPayeCol: number;
}

function getPayeSheetGeometry(): PayeSheetGeometry {
  const bands = getTaxBands();
  const bandsHeaderRow = 3;
  const employeeHeaderRow = bandsHeaderRow + bands.length + 2;
  const fixedHeaders = 5;
  const firstTaxableCol = fixedHeaders + 1;
  const firstTaxCol = firstTaxableCol + bands.length;
  const annualTaxCol = firstTaxCol + bands.length;
  const monthlyPayeCol = annualTaxCol + 1;
  return {
    bandsHeaderRow,
    employeeHeaderRow,
    firstTaxableCol,
    bandCount: bands.length,
    monthlyPayeCol,
  };
}

function buildPayeDetailRowMap(
  rows: SummaryRowInput[],
  employeeHeaderRow: number,
): Map<string, number> {
  const rowByRunItemId = new Map<string, number>();
  let rowNumber = employeeHeaderRow + 1;
  for (const { runItem, computedItem } of rows) {
    if (!computedItem?.taxBreakdown) {
      continue;
    }
    rowByRunItemId.set(runItem.id, rowNumber);
    rowNumber++;
  }
  return rowByRunItemId;
}

function buildSummarySheet(
  workbook: Workbook,
  run: PayrollRun,
  computed: PayrollComputedRun,
  rows: SummaryRowInput[],
  payeDetailRowByRunItemId: Map<string, number>,
  payeGeometry: PayeSheetGeometry,
): void {
  const sheet = workbook.addWorksheet('Payroll Summary', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  SUMMARY_COLUMNS.forEach((column, i) => {
    sheet.getColumn(i + 1).width = column.width;
  });

  sheet.getCell('A1').value = `${run.companyName ?? 'Company'} — Payroll`;
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A2').value = 'Period';
  sheet.getCell('B2').value = periodLabel(run);
  sheet.getCell('C2').value = 'Status';
  sheet.getCell('D2').value = run.status === 'final' ? 'FINAL' : 'DRAFT';
  sheet.getCell('E2').value = 'Computed';
  sheet.getCell('F2').value = computed.computedAt;
  sheet.getRow(2).font = { size: 10 };

  const headerRowNumber = 4;
  sheet.getRow(headerRowNumber).values = SUMMARY_COLUMNS.map(
    (column) => column.header,
  );
  styleHeaderRow(sheet, headerRowNumber, { leftAlignedCols: [1, 2] });
  for (let col = 3; col <= SUMMARY_COLUMNS.length; col++) {
    setMoneyColumnAlignment(sheet, col);
  }

  const firstDataRow = headerRowNumber + 1;
  rows.forEach(({ runItem, computedItem }, index) => {
    const rowNumber = firstDataRow + index;
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = runItem.employeeSnapshot.fullName;
    row.getCell(2).value = runItem.employeeSnapshot.role ?? '';
    if (!computedItem) {
      return;
    }

    const basic = money(computedItem.breakdown?.basic);
    const housing = money(computedItem.breakdown?.housing);
    const transport = money(computedItem.breakdown?.transport);
    const gross = money(computedItem.gross);
    const oneOffAllowances = money(
      computedItem.taxBreakdown?.oneOffAllowances.taxable,
    );
    const paye = money(computedItem.paye);
    const eePension = money(computedItem.employeePension);
    const eeNhf = money(computedItem.employeeNhf);
    const eeNhis = money(computedItem.employeeNhis);
    const recurring = money(computedItem.recurringDeductions);
    const oneOffDeductions = sumAmounts(runItem.edits?.oneOffDeductions);
    const totalDeductions = money(computedItem.totalDeductions);
    const netPay = money(computedItem.netPay);
    const erPension = money(computedItem.employerPension);
    const erNhis = money(computedItem.employerNhis);
    const erOneOff = sumAmounts(runItem.edits?.oneOffEmployerContributions);
    const employerCost = money(computedItem.employerCost);

    setMoney(row.getCell(3), basic);
    setMoney(row.getCell(4), housing);
    setMoney(row.getCell(5), transport);
    // F: Gross = Basic + Housing + Transport (explicit BHT components may not
    // sum to gross, in which case the engine value is written as-is)
    setRollupCell(
      row.getCell(6),
      `SUM(C${rowNumber}:E${rowNumber})`,
      gross,
      basic + housing + transport,
    );
    setMoney(row.getCell(7), oneOffAllowances);
    const payeDetailRow = payeDetailRowByRunItemId.get(runItem.id);
    if (payeDetailRow != null) {
      const payeCol = colLetter(payeGeometry.monthlyPayeCol);
      setLinkedCell(
        row.getCell(8),
        `'${PAYE_DETAIL_SHEET}'!$${payeCol}$${payeDetailRow}`,
        paye,
      );
    } else {
      setMoney(row.getCell(8), paye);
    }
    setMoney(row.getCell(9), eePension);
    setMoney(row.getCell(10), eeNhf);
    setMoney(row.getCell(11), eeNhis);
    setMoney(row.getCell(12), recurring);
    setMoney(row.getCell(13), oneOffDeductions);
    // N: Total Deductions = EE Pension + EE NHF + EE NHIS + Recurring + One-off
    // (PAYE is not part of totalDeductions in the engine)
    setRollupCell(
      row.getCell(14),
      `SUM(I${rowNumber}:M${rowNumber})`,
      totalDeductions,
      eePension + eeNhf + eeNhis + recurring + oneOffDeductions,
    );
    // O: Net Pay = Gross + One-off Allowances − Total Deductions − PAYE
    setRollupCell(
      row.getCell(15),
      `F${rowNumber}+G${rowNumber}-N${rowNumber}-H${rowNumber}`,
      netPay,
      gross + oneOffAllowances - totalDeductions - paye,
    );
    setMoney(row.getCell(16), erPension);
    setMoney(row.getCell(17), erNhis);
    setMoney(row.getCell(18), erOneOff);
    // S: Employer Cost = Gross + One-off Allowances + ER Pension + ER NHIS + ER One-offs
    setRollupCell(
      row.getCell(19),
      `F${rowNumber}+G${rowNumber}+SUM(P${rowNumber}:R${rowNumber})`,
      employerCost,
      gross + erPension + erNhis + oneOffAllowances + erOneOff,
    );
  });

  // Totals row: SUM over the employee range for every money column
  const totalsRowNumber = firstDataRow + rows.length;
  const totalsRow = sheet.getRow(totalsRowNumber);
  totalsRow.getCell(1).value = 'TOTAL';
  totalsRow.font = { bold: true };
  const lastDataRow = totalsRowNumber - 1;
  if (lastDataRow >= firstDataRow) {
    for (let col = 3; col <= SUMMARY_COLUMNS.length; col++) {
      const letter = colLetter(col);
      let columnTotal = 0;
      for (let r = firstDataRow; r <= lastDataRow; r++) {
        const value = sheet.getCell(`${letter}${r}`).value;
        if (typeof value === 'number') {
          columnTotal += value;
        } else if (value && typeof value === 'object' && 'result' in value) {
          columnTotal += Number(value.result ?? 0);
        }
      }
      totalsRow.getCell(col).value = {
        formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`,
        result: columnTotal,
      };
      totalsRow.getCell(col).numFmt = MONEY_FMT;
    }
  }

  const footerRowNumber = totalsRowNumber + 1;
  sheet.getCell(`A${footerRowNumber}`).value =
    `Generated by Accountable Payroll · ${computed.computedAt} · ${run.status === 'final' ? 'FINAL' : 'DRAFT'}`;
  sheet.getRow(footerRowNumber).font = { size: 9, italic: true };
}

function buildPayeDetailSheet(
  workbook: Workbook,
  rows: SummaryRowInput[],
  payeGeometry: PayeSheetGeometry,
): void {
  const sheet = workbook.addWorksheet(PAYE_DETAIL_SHEET, {
    views: [{ state: 'frozen', ySplit: payeGeometry.employeeHeaderRow }],
  });
  const bands = getTaxBands();

  sheet.getCell('A1').value = 'PAYE Annual Tax Detail';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A2').value =
    'Band taxable columns (F–K) are hidden by default — unhide them to audit per-band allocation.';
  sheet.getRow(2).font = { size: 10, italic: true };

  // Tax bands table — the single place rates are written; every band-tax
  // formula below references these cells absolutely.
  const {
    bandsHeaderRow,
    employeeHeaderRow,
    firstTaxableCol,
    bandCount,
    monthlyPayeCol,
  } = payeGeometry;
  sheet.getRow(bandsHeaderRow).values = [
    'Band',
    'Range',
    'From (₦)',
    'To (₦)',
    'Rate',
  ];
  styleHeaderRow(sheet, bandsHeaderRow, { leftAlignedCols: [1, 2] });
  for (let col = 3; col <= 5; col++) {
    setMoneyColumnAlignment(sheet, col);
  }
  bands.forEach((band, i) => {
    const row = sheet.getRow(bandsHeaderRow + 1 + i);
    row.getCell(1).value = `Band ${i + 1}`;
    row.getCell(2).value = band.label;
    row.getCell(3).value = band.min;
    row.getCell(3).numFmt = INT_FMT;
    if (band.max != null) {
      row.getCell(4).value = band.max;
      row.getCell(4).numFmt = INT_FMT;
    }
    setBandRate(row.getCell(5), band.rate);
  });
  const bandRateCell = (bandIndex: number): string =>
    `$E$${bandsHeaderRow + 1 + bandIndex}`;

  // Employee table
  const headerRowNumber = employeeHeaderRow;
  const fixedHeaders = [
    'Employee',
    'Annual Gross',
    'Rent Relief',
    'Allowable Deductions',
    'Annual Taxable Income',
  ];
  const taxableHeaders = bands.map((_, i) => `Band ${i + 1} Taxable`);
  const taxHeaders = bands.map((_, i) => `Band ${i + 1} Tax`);
  const trailingHeaders = ['Annual Tax', 'Monthly PAYE', 'YTD?'];
  sheet.getRow(headerRowNumber).values = [
    ...fixedHeaders,
    ...taxableHeaders,
    ...taxHeaders,
    ...trailingHeaders,
  ];
  styleHeaderRow(sheet, headerRowNumber, { leftAlignedCols: [1] });

  const firstTaxCol = firstTaxableCol + bands.length;
  const annualTaxCol = firstTaxCol + bands.length;
  const ytdCol = monthlyPayeCol + 1;

  sheet.getColumn(1).width = 28;
  const totalColumns =
    fixedHeaders.length + bands.length * 2 + trailingHeaders.length;
  for (let col = 2; col <= totalColumns; col++) {
    sheet.getColumn(col).width = 14;
    if (col !== ytdCol) {
      setMoneyColumnAlignment(sheet, col);
    }
  }

  // Hide per-band taxable columns — auditors can unhide; band tax formulas still work.
  for (let col = firstTaxableCol; col < firstTaxableCol + bandCount; col++) {
    sheet.getColumn(col).hidden = true;
  }

  let rowNumber = headerRowNumber + 1;
  for (const { runItem, computedItem } of rows) {
    const breakdown = computedItem?.taxBreakdown;
    if (!breakdown) {
      continue;
    }
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = runItem.employeeSnapshot.fullName;

    const annualGross = money(breakdown.taxCalculation.annualTaxableGross);
    const rentRelief = money(breakdown.rentRelief.reliefAmount);
    const allowable = money(breakdown.taxCalculation.annualAllowableDeductions);
    const taxableIncome = money(breakdown.taxCalculation.annualTaxableIncome);
    const annualTax = money(breakdown.taxCalculation.annualTax);

    setMoney(row.getCell(2), annualGross);
    setMoney(row.getCell(3), rentRelief);
    setMoney(row.getCell(4), allowable);
    setRollupCell(
      row.getCell(5),
      `B${rowNumber}-C${rowNumber}-D${rowNumber}`,
      taxableIncome,
      annualGross - rentRelief - allowable,
    );

    let bandTaxSum = 0;
    bands.forEach((band, i) => {
      const entry = breakdown.taxBandBreakdown?.find(
        (candidate) => candidate.label === band.label,
      );
      if (!entry) {
        return;
      }
      const taxableAmount = money(entry.taxableAmount);
      const taxAmount = money(entry.taxAmount);
      bandTaxSum += taxAmount;
      const taxableCellRef = `${colLetter(firstTaxableCol + i)}${rowNumber}`;
      setMoney(row.getCell(firstTaxableCol + i), taxableAmount);
      setRollupCell(
        row.getCell(firstTaxCol + i),
        `${taxableCellRef}*${bandRateCell(i)}`,
        taxAmount,
        taxableAmount * band.rate,
      );
    });

    setRollupCell(
      row.getCell(annualTaxCol),
      `SUM(${colLetter(firstTaxCol)}${rowNumber}:${colLetter(firstTaxCol + bands.length - 1)}${rowNumber})`,
      annualTax,
      bandTaxSum,
    );
    const monthlyPaye = money(breakdown.taxCalculation.currentMonthPaye);
    const annualTaxCellRef = `${colLetter(annualTaxCol)}${rowNumber}`;
    if (!breakdown.usedYtd) {
      setRollupCell(
        row.getCell(monthlyPayeCol),
        `${annualTaxCellRef}/12`,
        monthlyPaye,
        annualTax / 12,
      );
    } else {
      setMoney(row.getCell(monthlyPayeCol), monthlyPaye);
    }
    row.getCell(ytdCol).value = breakdown.usedYtd ? 'Yes' : 'No';
    rowNumber++;
  }
}

function addKeyValueRow(
  sheet: Worksheet,
  rowNumber: number,
  key: string,
  value: string | number | boolean,
  numFmt?: string,
): number {
  const row = sheet.getRow(rowNumber);
  row.getCell(1).value = key;
  const valueCell = row.getCell(2);
  valueCell.value = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
  if (numFmt) {
    valueCell.numFmt = numFmt;
  }
  return rowNumber + 1;
}

function buildAssumptionsSheet(
  workbook: Workbook,
  run: PayrollRun,
  computed: PayrollComputedRun,
  rows: SummaryRowInput[],
): void {
  const sheet = workbook.addWorksheet('Assumptions');
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 26;
  sheet.getColumn(3).width = 44;
  sheet.getColumn(4).width = 14;

  sheet.getCell('A1').value = 'Assumptions & Settings';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A2').value =
    'PAYE, pension, NHF and NHIS are engine-computed values. See PAYE Detail for the annual tax breakdown; rollup cells use live formulas over those values.';
  sheet.getCell('A2').font = { size: 10, italic: true };

  const settings = run.settings ?? COMPANY_DEFAULTS.settings!;
  let rowNumber = 4;
  sheet.getCell(`A${rowNumber}`).value = 'Run settings';
  sheet.getRow(rowNumber).font = { bold: true };
  rowNumber++;
  rowNumber = addKeyValueRow(
    sheet,
    rowNumber,
    'Company',
    run.companyName ?? '',
  );
  rowNumber = addKeyValueRow(sheet, rowNumber, 'Period', periodLabel(run));
  rowNumber = addKeyValueRow(
    sheet,
    rowNumber,
    'Status',
    run.status === 'final' ? 'FINAL' : 'DRAFT',
  );
  rowNumber = addKeyValueRow(
    sheet,
    rowNumber,
    'Computed at',
    computed.computedAt,
  );
  rowNumber = addKeyValueRow(
    sheet,
    rowNumber,
    'Employees',
    computed.periodTotals.employeeCount,
  );
  rowNumber = addKeyValueRow(
    sheet,
    rowNumber,
    'Default state',
    settings.defaultState,
  );
  rowNumber = addKeyValueRow(
    sheet,
    rowNumber,
    'Pension (company)',
    formatStatutorySummary(settings.statutoryDeductions.pension),
  );
  rowNumber = addKeyValueRow(
    sheet,
    rowNumber,
    'NHF (company)',
    formatStatutorySummary(settings.statutoryDeductions.nhf),
  );
  rowNumber = addKeyValueRow(
    sheet,
    rowNumber,
    'NHIS (company)',
    formatStatutorySummary(settings.statutoryDeductions.nhis),
  );
  rowNumber = addKeyValueRow(
    sheet,
    rowNumber,
    'BHT breakdown',
    ['basic', 'housing', 'transport']
      .map((part) => {
        const rate =
          settings.bhtBreakdown[part as 'basic' | 'housing' | 'transport'];
        return rate != null ? `${part} ${Math.round(rate * 100)}%` : null;
      })
      .filter(Boolean)
      .join(', ') || 'basic 100%',
  );
  rowNumber = addKeyValueRow(
    sheet,
    rowNumber,
    'Proration method',
    settings.employmentProrationMethod,
  );
  rowNumber = addKeyValueRow(
    sheet,
    rowNumber,
    'Rent relief enabled',
    settings.enableRentRelief !== false,
  );
  rowNumber = addKeyValueRow(
    sheet,
    rowNumber,
    'YTD PAYE enabled',
    settings.enableYtd !== false,
  );

  // Employee overrides, from the engine's own resolution record
  rowNumber += 1;
  sheet.getCell(`A${rowNumber}`).value = 'Employee overrides (engine-resolved)';
  sheet.getRow(rowNumber).font = { bold: true };
  rowNumber++;
  const overridesHeaderRow = rowNumber;
  sheet.getRow(overridesHeaderRow).values = ['Employee', 'Setting', 'Details'];
  styleHeaderRow(sheet, overridesHeaderRow);
  rowNumber++;

  let overrideCount = 0;
  for (const { runItem, computedItem } of rows) {
    const resolution = computedItem?.settingsResolution;
    if (!resolution) {
      continue;
    }
    const name = runItem.employeeSnapshot.fullName;
    const overrideRows: Array<[string, string]> = [];
    if (resolution.pension.source === 'employee') {
      overrideRows.push([
        'Pension',
        formatStatutorySummary(resolution.pension.config),
      ]);
    }
    if (resolution.nhf.source === 'employee') {
      overrideRows.push(['NHF', formatStatutorySummary(resolution.nhf.config)]);
    }
    if (resolution.nhis.source === 'employee') {
      overrideRows.push([
        'NHIS',
        formatStatutorySummary(resolution.nhis.config),
      ]);
    }
    if (
      resolution.state.source === 'employee' &&
      resolution.state.value !== resolution.state.companyDefault
    ) {
      overrideRows.push([
        'Tax state',
        `${resolution.state.value} (company default: ${resolution.state.companyDefault})`,
      ]);
    }
    if (resolution.bhtBreakdown.source === 'employee') {
      overrideRows.push([
        'BHT split',
        'Custom basic / housing / transport split',
      ]);
    }
    if (resolution.appliedRecurringDeductions > 0) {
      overrideRows.push([
        'Recurring deductions',
        `${resolution.appliedRecurringDeductions} active this period`,
      ]);
    }
    for (const [setting, details] of overrideRows) {
      const row = sheet.getRow(rowNumber);
      row.getCell(1).value = name;
      row.getCell(2).value = setting;
      row.getCell(3).value = details;
      rowNumber++;
      overrideCount++;
    }
  }
  if (overrideCount === 0) {
    sheet.getCell(`A${rowNumber}`).value =
      'None — all employees use company settings.';
    rowNumber++;
  }

  const rentWarnings = computed.warnings?.incompleteRentData;
  if (rentWarnings && rentWarnings.length > 0) {
    rowNumber += 1;
    sheet.getCell(`A${rowNumber}`).value = 'Warnings';
    sheet.getRow(rowNumber).font = { bold: true };
    rowNumber++;
    for (const warning of rentWarnings) {
      sheet.getCell(`A${rowNumber}`).value =
        `Incomplete rent data (relief used extrapolation): ${warning}`;
      rowNumber++;
    }
  }
}

async function loadExcelJs(): Promise<typeof import('exceljs')> {
  // exceljs is CJS; depending on the bundler it may arrive under `default`.
  const mod = (await import('exceljs')) as typeof import('exceljs') & {
    default?: typeof import('exceljs');
  };
  return mod.default ?? mod;
}

export async function buildPayrollWorkbook(
  run: PayrollRun,
  computed: PayrollComputedRun,
): Promise<Workbook> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Accountable Payroll';
  workbook.created = new Date();

  const computedById = new Map(
    computed.items.map((item) => [item.runItemId, item]),
  );
  const rows: SummaryRowInput[] = run.items.map((runItem) => ({
    runItem,
    computedItem: computedById.get(runItem.id),
  }));

  const payeGeometry = getPayeSheetGeometry();
  const payeDetailRowByRunItemId = buildPayeDetailRowMap(
    rows,
    payeGeometry.employeeHeaderRow,
  );

  buildSummarySheet(
    workbook,
    run,
    computed,
    rows,
    payeDetailRowByRunItemId,
    payeGeometry,
  );
  buildPayeDetailSheet(workbook, rows, payeGeometry);
  buildAssumptionsSheet(workbook, run, computed, rows);
  return workbook;
}

/** Build the workbook and trigger a browser download. */
export async function exportPayrollExcel(
  run: PayrollRun,
  computed: PayrollComputedRun,
): Promise<void> {
  const workbook = await buildPayrollWorkbook(run, computed);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const period = getPeriodStartKey(run);
  const company = run.companyName?.trim().replace(/\s+/g, '-') || 'company';
  downloadBlob(blob, `${company}-payroll-${period}.xlsx`);
}
