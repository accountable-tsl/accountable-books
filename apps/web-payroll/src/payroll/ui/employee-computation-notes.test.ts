import { beforeEach, describe, expect, it, vi } from 'vitest';

import { computeRun } from '../compute/compute-run';
import { PAYROLL_TOOL_SCHEMA_VERSION } from '../domain';
import { getEmployeeComputationNotes } from './employee-computation-notes';

import type { PayrollRun, PayrollRunItem } from '../domain';

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

const BASE_COMPENSATION = [
  { id: 'c-1', fromMonth: '2026-01', annualGross: '2400000' },
];

function makeRunItem(
  payProfile: PayrollRunItem['payProfileSnapshot'],
  edits?: PayrollRunItem['edits'],
): PayrollRunItem {
  return {
    id: 'item-1',
    employeeSnapshot: { fullName: 'Test Employee' },
    payProfileSnapshot: payProfile,
    edits,
  };
}

function makeRun(
  item: PayrollRunItem,
  settings: Partial<NonNullable<PayrollRun['settings']>> = {},
): PayrollRun {
  return {
    schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
    id: 'run-2026-06',
    companyId: 'company-1',
    companyName: 'Test Company',
    rulesetKey: 'ng',
    periodMonth: 6,
    periodYear: 2026,
    status: 'draft',
    items: [item],
    settings: { ...RUN_SETTINGS, ...settings },
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  };
}

/** Run the real compute engine, then format its output into notes. */
async function computeNotes(run: PayrollRun): Promise<string[]> {
  const computed = await computeRun(run);
  return getEmployeeComputationNotes({
    runItem: run.items[0],
    computedItem: computed.items[0],
  });
}

describe('getEmployeeComputationNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no notes before computation has run', () => {
    const notes = getEmployeeComputationNotes({
      runItem: makeRunItem({ compensationHistory: BASE_COMPENSATION }),
      computedItem: undefined,
    });

    expect(notes).toEqual([]);
  });

  it('notes pension override when company pension is disabled', async () => {
    const notes = await computeNotes(
      makeRun(
        makeRunItem({
          compensationHistory: BASE_COMPENSATION,
          pension: { enabled: true, employeeRate: 0.08, employerRate: 0.12 },
        }),
        {
          statutoryDeductions: {
            pension: { enabled: false },
            nhf: { enabled: false },
            nhis: { enabled: false },
          },
        },
      ),
    );

    expect(notes.some((note) => note.includes('Pension override'))).toBe(true);
    expect(notes.some((note) => note.includes('8% EE, 12% ER'))).toBe(true);
    expect(notes.some((note) => note.includes('company pension is off'))).toBe(
      true,
    );
  });

  it('notes rent relief with the amounts the engine computed', async () => {
    const notes = await computeNotes(
      makeRun(
        makeRunItem({
          compensationHistory: BASE_COMPENSATION,
          rentHistory: [
            {
              id: 'rent-1',
              fromMonth: '2026-01',
              toMonth: '2026-12',
              rent: '1200000',
            },
          ],
        }),
      ),
    );

    const rentNote = notes.find((note) => note.includes('Rent relief'));
    expect(rentNote).toBeDefined();
    expect(rentNote).toContain('₦1,200,000');
    expect(rentNote).toContain('₦240,000');
  });

  it('omits the rent relief note when the run disables rent relief', async () => {
    const notes = await computeNotes(
      makeRun(
        makeRunItem({
          compensationHistory: BASE_COMPENSATION,
          rentHistory: [
            {
              id: 'rent-1',
              fromMonth: '2026-01',
              toMonth: '2026-12',
              rent: '1200000',
            },
          ],
        }),
        { enableRentRelief: false },
      ),
    );

    expect(notes.some((note) => note.includes('Rent relief'))).toBe(false);
  });

  it('notes a tax state that differs from the company default', async () => {
    const notes = await computeNotes(
      makeRun(
        makeRunItem({
          state: 'Abuja',
          compensationHistory: BASE_COMPENSATION,
        }),
      ),
    );

    expect(notes).toContain('Tax state: Abuja (company default: Lagos)');
  });

  it('notes a custom basic/housing/transport split', async () => {
    const notes = await computeNotes(
      makeRun(
        makeRunItem({
          compensationHistory: [
            {
              id: 'c-1',
              fromMonth: '2026-01',
              annualGross: '2400000',
              annualBasic: '1200000',
              annualHousing: '600000',
              annualTransport: '600000',
            },
          ],
        }),
      ),
    );

    expect(notes).toContain('Custom basic / housing / transport split');
  });

  it('only counts recurring deductions active in the run month', async () => {
    const notes = await computeNotes(
      makeRun(
        makeRunItem({
          compensationHistory: BASE_COMPENSATION,
          recurringDeductions: [
            {
              id: 'ded-expired',
              name: 'Old loan',
              amount: '10000',
              fromMonth: '2025-01',
              toMonth: '2025-06',
            },
            {
              id: 'ded-active',
              name: 'Union dues',
              amount: '2000',
              fromMonth: '2026-01',
            },
          ],
        }),
      ),
    );

    expect(notes).toContain('1 recurring deduction');
  });

  it('counts one-off employer contributions as adjustments', async () => {
    const notes = await computeNotes(
      makeRun(
        makeRunItem(
          { compensationHistory: BASE_COMPENSATION },
          {
            oneOffEmployerContributions: [
              {
                id: 'contrib-1',
                type: 'pension',
                name: 'Pension top-up',
                amount: '50000',
              },
            ],
          },
        ),
      ),
    );

    expect(notes).toContain('1 one-off adjustment this period');
  });

  it('returns no notes for a plain employee', async () => {
    const notes = await computeNotes(
      makeRun(
        makeRunItem({
          state: 'Lagos',
          compensationHistory: BASE_COMPENSATION,
        }),
      ),
    );

    expect(notes).toEqual([]);
  });
});
