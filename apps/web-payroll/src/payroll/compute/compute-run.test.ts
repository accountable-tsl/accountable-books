import { beforeEach, describe, expect, it, vi } from 'vitest';

import { computeRun } from './compute-run';

import type { PayrollRun } from '../domain';

/**
 * Test suite for payroll run computation
 *
 * Tests cover:
 * - Empty run returns empty results
 * - Basic run computation with one employee
 */

// Mock the storage module to avoid actual storage calls
vi.mock('../storage', () => ({
  loadRunsIndex: vi.fn().mockResolvedValue({
    schemaVersion: 1,
    runs: [],
  }),
  loadRun: vi.fn(),
}));

describe('computeRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty results for empty run', async () => {
    const run: PayrollRun = {
      id: 'run-2024-03',
      companyId: 'company-1',
      companyName: 'Test Company',
      periodMonth: 3,
      periodYear: 2024,
      status: 'draft',
      items: [],
      settings: {},
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-03-01T00:00:00Z',
    };

    const result = await computeRun(run);

    expect(result).toBeDefined();
    expect(result.items).toHaveLength(0);
    expect(result.periodTotals.employeeCount).toBe(0);
  });

  it('should compute payroll for run with one employee', async () => {
    const run: PayrollRun = {
      id: 'run-2024-03',
      companyId: 'company-1',
      companyName: 'Test Company',
      periodMonth: 3,
      periodYear: 2024,
      status: 'draft',
      items: [
        {
          id: 'item-1',
          employeeSnapshot: {
            fullName: 'John Doe',
            taxId: 'TAX123',
            identity: {
              id: 'TAX123',
              type: 'tax_id',
            },
          },
          payProfileSnapshot: {
            compensationHistory: [
              {
                id: 'comp-1',
                fromMonth: '2024-01',
                toMonth: undefined,
                annualGross: '2400000', // 2.4M annual
              },
            ],
          },
          edits: {},
        },
      ],
      settings: {
        pension: {
          enabled: true,
          employeeRate: 0.08,
          employerRate: 0.1,
        },
        nhf: {
          enabled: true,
          employeeRate: 0.025,
        },
        nhis: {
          enabled: true,
          employeeRate: 0.015,
          employerRate: 0.015,
        },
      },
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-03-01T00:00:00Z',
    };

    const result = await computeRun(run);

    expect(result).toBeDefined();
    expect(result.items).toHaveLength(1);
    expect(result.periodTotals.employeeCount).toBe(1);
    expect(result.items[0].gross).toBeDefined();
  });
});
