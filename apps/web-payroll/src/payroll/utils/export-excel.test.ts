import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { computeRun } from '../compute/compute-run';
import { PAYROLL_TOOL_SCHEMA_VERSION } from '../domain';
import { buildPayrollWorkbook } from './export-excel';

import type { PayrollComputedRun, PayrollRun, PayrollRunItem } from '../domain';

// Mock the storage module to avoid actual storage calls (YTD lookups)
vi.mock('../storage', () => ({
  loadRunsIndex: vi.fn().mockResolvedValue({
    schemaVersion: 1,
    runs: [],
  }),
  loadRun: vi.fn(),
}));

const RUN_SETTINGS: NonNullable<PayrollRun['settings']> = {
  defaultState: 'Lagos',
  statutoryDeductions: {
    pension: { enabled: true, employeeRate: 0.08, employerRate: 0.1 },
    nhf: { enabled: false, employeeRate: 0.025 },
    nhis: { enabled: false, employeeRate: 0.05, employerRate: 0.1 },
  },
  bhtBreakdown: { basic: 1 },
  employmentProrationMethod: 'calendar_days',
  enableRentRelief: true,
  enableYtd: true,
};

function makeRun(items: PayrollRunItem[]): PayrollRun {
  return {
    schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
    id: 'run-2026-06',
    companyId: 'company-1',
    companyName: 'Test Company',
    rulesetKey: 'ng',
    periodMonth: 6,
    periodYear: 2026,
    status: 'draft',
    items,
    settings: RUN_SETTINGS,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  };
}

const RUN = makeRun([
  {
    id: 'item-1',
    employeeSnapshot: { fullName: 'Plain Employee' },
    payProfileSnapshot: {
      compensationHistory: [
        { id: 'c-1', fromMonth: '2026-01', annualGross: '2400000' },
      ],
    },
  },
  {
    id: 'item-2',
    employeeSnapshot: { fullName: 'Override Employee' },
    payProfileSnapshot: {
      compensationHistory: [
        { id: 'c-2', fromMonth: '2026-01', annualGross: '6000000' },
      ],
      pension: { enabled: true, employeeRate: 0.08, employerRate: 0.12 },
      rentHistory: [
        {
          id: 'rent-1',
          fromMonth: '2026-01',
          toMonth: '2026-12',
          rent: '1200000',
        },
      ],
    },
  },
]);

// Sheet geometry (kept in sync with export-excel.ts)
const SUMMARY_FIRST_DATA_ROW = 5;
const PAYE_BANDS_FIRST_ROW = 4;
const PAYE_FIRST_DATA_ROW = 12;

async function buildAndReload(): Promise<{
  computed: PayrollComputedRun;
  reloaded: ExcelJS.Workbook;
}> {
  const computed = await computeRun(RUN);
  const workbook = await buildPayrollWorkbook(RUN, computed);
  const buffer = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  return { computed, reloaded };
}

describe('buildPayrollWorkbook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes each tax band rate exactly once, referenced by formula from every employee', async () => {
    const { computed, reloaded } = await buildAndReload();
    const paye = reloaded.getWorksheet('PAYE Detail');
    expect(paye).toBeDefined();

    // The 15% rate appears once, in the bands table (row 5, band 2)
    let occurrences = 0;
    paye!.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value === 0.15) {
          occurrences++;
        }
      });
    });
    expect(occurrences).toBe(1);
    expect(paye!.getCell(`E${PAYE_BANDS_FIRST_ROW + 1}`).value).toBe(0.15);

    // Override Employee (second data row) reaches band 2: tax cell is a
    // formula over its taxable cell × the shared rate cell, cached to the
    // engine's number.
    const employeeRow = PAYE_FIRST_DATA_ROW + 1;
    const band2TaxCell = paye!.getCell(`M${employeeRow}`);
    expect(band2TaxCell.formula).toBe(
      `G${employeeRow}*$E$${PAYE_BANDS_FIRST_ROW + 1}`,
    );
    const engineBand2 = computed.items[1].taxBreakdown?.taxBandBreakdown?.[1];
    expect(engineBand2).toBeDefined();
    expect(Number(band2TaxCell.result)).toBeCloseTo(
      Number.parseFloat(engineBand2!.taxAmount),
      2,
    );
  });

  it('writes annual taxable income and annual tax as reconciling formulas', async () => {
    const { computed, reloaded } = await buildAndReload();
    const paye = reloaded.getWorksheet('PAYE Detail')!;
    const employeeRow = PAYE_FIRST_DATA_ROW + 1;

    const taxableCell = paye.getCell(`E${employeeRow}`);
    expect(taxableCell.formula).toBe(
      `B${employeeRow}-C${employeeRow}-D${employeeRow}`,
    );
    expect(Number(taxableCell.result)).toBeCloseTo(
      Number.parseFloat(
        computed.items[1].taxBreakdown!.taxCalculation.annualTaxableIncome,
      ),
      2,
    );

    const annualTaxCell = paye.getCell(`R${employeeRow}`);
    expect(annualTaxCell.formula).toBe(`SUM(L${employeeRow}:Q${employeeRow})`);
    expect(Number(annualTaxCell.result)).toBeCloseTo(
      Number.parseFloat(
        computed.items[1].taxBreakdown!.taxCalculation.annualTax,
      ),
      2,
    );
  });

  it('writes summary rollups as formulas cached to engine values', async () => {
    const { computed, reloaded } = await buildAndReload();
    const summary = reloaded.getWorksheet('Payroll Summary')!;
    const row = SUMMARY_FIRST_DATA_ROW; // Plain Employee

    const grossCell = summary.getCell(`F${row}`);
    expect(grossCell.formula).toBe(`SUM(C${row}:E${row})`);
    expect(Number(grossCell.result)).toBeCloseTo(
      Number.parseFloat(computed.items[0].gross),
      2,
    );

    const payeCell = summary.getCell(`H${row}`);
    expect(payeCell.formula).toBe(`'PAYE Detail'!$S$${PAYE_FIRST_DATA_ROW}`);
    expect(Number(payeCell.result)).toBeCloseTo(
      Number.parseFloat(computed.items[0].paye ?? '0'),
      2,
    );

    const netCell = summary.getCell(`O${row}`);
    expect(netCell.formula).toBe(`F${row}+G${row}-N${row}-H${row}`);
    expect(Number(netCell.result)).toBeCloseTo(
      Number.parseFloat(computed.items[0].netPay),
      2,
    );
  });

  it('writes a totals row whose SUMs match the run period totals', async () => {
    const { computed, reloaded } = await buildAndReload();
    const summary = reloaded.getWorksheet('Payroll Summary')!;
    const totalsRow = SUMMARY_FIRST_DATA_ROW + RUN.items.length;

    const grossTotalCell = summary.getCell(`F${totalsRow}`);
    expect(grossTotalCell.formula).toBe(
      `SUM(F${SUMMARY_FIRST_DATA_ROW}:F${totalsRow - 1})`,
    );
    expect(Number(grossTotalCell.result)).toBeCloseTo(
      Number.parseFloat(computed.periodTotals.grossTotal),
      2,
    );

    const netTotalCell = summary.getCell(`O${totalsRow}`);
    expect(Number(netTotalCell.result)).toBeCloseTo(
      Number.parseFloat(computed.periodTotals.netTotal),
      2,
    );
  });

  it('formats the zero tax band rate without a stray decimal point', async () => {
    const { reloaded } = await buildAndReload();
    const paye = reloaded.getWorksheet('PAYE Detail')!;

    const zeroRateCell = paye.getCell(`E${PAYE_BANDS_FIRST_ROW}`);
    expect(zeroRateCell.value).toBe(0);
    expect(zeroRateCell.numFmt).toBe('0%');
  });

  it('orders sheets as Summary, PAYE Detail, then Assumptions', async () => {
    const { reloaded } = await buildAndReload();
    expect(reloaded.worksheets.map((sheet) => sheet.name)).toEqual([
      'Payroll Summary',
      'PAYE Detail',
      'Assumptions',
    ]);
  });

  it('hides per-band taxable columns on PAYE Detail by default', async () => {
    const { reloaded } = await buildAndReload();
    const paye = reloaded.getWorksheet('PAYE Detail')!;

    for (const col of ['F', 'G', 'H', 'I', 'J', 'K']) {
      expect(paye.getColumn(col).hidden).toBe(true);
    }
    expect(paye.getColumn('L').hidden).not.toBe(true);
  });

  it('lists engine-resolved employee overrides on the Assumptions sheet', async () => {
    const { reloaded } = await buildAndReload();
    const assumptions = reloaded.getWorksheet('Assumptions')!;

    const cellTexts: string[] = [];
    assumptions.eachRow((row) => {
      row.eachCell((cell) => {
        cellTexts.push(String(cell.value ?? ''));
      });
    });

    expect(cellTexts).toContain('Override Employee');
    expect(cellTexts).toContain('Pension');
    expect(cellTexts.some((text) => text.includes('8% EE, 12% ER'))).toBe(true);
    // Plain employee contributes no override rows
    expect(cellTexts).not.toContain('Plain Employee');
  });
});
