import { describe, expect, it } from 'vitest';

import { extractYtdData } from './extract-ytd';

import type { PayrollRun, PayrollRunItem } from '../domain';

/**
 * Test suite for YTD data extraction
 *
 * Tests cover:
 * - Returns undefined when employee cannot be matched
 * - Basic YTD extraction with simple data
 */

describe('extractYtdData', () => {
  it('should return undefined if employee cannot be matched (no refId or taxId)', () => {
    const runItem: PayrollRunItem = {
      id: 'item-1',
      employeeSnapshot: {
        fullName: 'John Doe',
        taxId: undefined,
        identity: {
          id: undefined,
          type: 'tax_id',
        },
      },
      payProfileSnapshot: {
        compensationHistory: [
          {
            id: 'comp-1',
            fromMonth: '2024-01',
            toMonth: undefined,
            annualGross: '2400000',
          },
        ],
      },
      edits: {},
    };

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

    const result = extractYtdData(runItem, run, []);

    expect(result).toBeUndefined();
  });

  it('should extract YTD data when employee has taxId', () => {
    const runItem: PayrollRunItem = {
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
            annualGross: '2400000', // 2.4M annual = 200k monthly
          },
        ],
      },
      edits: {},
    };

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

    const result = extractYtdData(runItem, run, []);

    // Should return YTD data with projected annual gross
    expect(result).toBeDefined();
    expect(result?.projectedAnnualGross).toBe(2_400_000);
    expect(result?.workedMonthUnits).toBeGreaterThan(0);
  });
});
