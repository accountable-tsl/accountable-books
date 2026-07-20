import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockConstraintContext,
  createMockEntry,
  createMockFiscalPeriod,
} from '../__test-helpers__.js';
import { ensureAndFetchFiscalCalendar } from '../../reporting/fiscal-calendar/fiscal-calendar.service.js';
import { periodNotLocked } from './period-not-locked.js';

vi.mock('../../reporting/fiscal-calendar/fiscal-calendar.service.js', () => ({
  ensureAndFetchFiscalCalendar: vi.fn(),
}));

const mockedEnsureAndFetchFiscalCalendar =
  ensureAndFetchFiscalCalendar as ReturnType<typeof vi.fn>;

describe('periodNotLocked constraint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('valid cases', () => {
    it('should pass when transaction date is in open period', async () => {
      mockedEnsureAndFetchFiscalCalendar.mockResolvedValue({
        rows: [createMockFiscalPeriod()],
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            fs_date: '2024-01-15',
          }),
        ],
        transaction_date: '2024-01-15',
      });

      const result = await periodNotLocked.validate(ctx);
      expect(result).toEqual([]);
    });

    it('should use transaction_date when entry dates are missing', async () => {
      mockedEnsureAndFetchFiscalCalendar.mockResolvedValue({
        rows: [createMockFiscalPeriod()],
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            // No fs_date
          }),
        ],
        transaction_date: '2024-01-15',
      });

      const result = await periodNotLocked.validate(ctx);
      expect(result).toEqual([]);
      expect(mockedEnsureAndFetchFiscalCalendar).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: ctx.companyUUID,
          startYMD: '2024-01-15',
          endYMD: '2024-01-15',
          fetchTypes: ['monthly'],
          requireMonthlyOpen: false,
        }),
      );
    });
  });

  describe('invalid cases', () => {
    it('should fail when transaction date is in closed period', async () => {
      const closedPeriod = createMockFiscalPeriod({
        fiscal_year: 2024,
        period_number: 1,
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        status: 'closed',
      });

      mockedEnsureAndFetchFiscalCalendar.mockResolvedValue({
        rows: [closedPeriod],
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            fs_date: '2024-01-15',
          }),
        ],
      });

      const result = await periodNotLocked.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.code).toBe('period_not_locked');
      expect(result[0]?.severity).toBe('error');
      expect(result[0]?.message).toContain('closed');
      expect(result[0]?.message).toContain('FY2024-P1');
    });

    it('should fail when transaction date is in locked period', async () => {
      const lockedPeriod = createMockFiscalPeriod({
        fiscal_year: 2024,
        period_number: 2,
        start_date: '2024-02-01',
        end_date: '2024-02-29',
        status: 'locked',
      });

      mockedEnsureAndFetchFiscalCalendar.mockResolvedValue({
        rows: [lockedPeriod],
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            fs_date: '2024-02-15',
          }),
        ],
      });

      const result = await periodNotLocked.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.message).toContain('locked');
    });

    it('should fail when transaction spans multiple closed periods', async () => {
      const period1 = createMockFiscalPeriod({
        fiscal_year: 2024,
        period_number: 1,
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        status: 'closed',
      });
      const period2 = createMockFiscalPeriod({
        fiscal_year: 2024,
        period_number: 2,
        start_date: '2024-02-01',
        end_date: '2024-02-29',
        status: 'closed',
      });

      mockedEnsureAndFetchFiscalCalendar.mockResolvedValue({
        rows: [period1, period2],
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            fs_date: '2024-01-15',
          }),
          createMockEntry({
            id: '2',
            fs_date: '2024-02-15',
          }),
        ],
      });

      const result = await periodNotLocked.validate(ctx);
      expect(result).toHaveLength(2);
      expect(result[0]?.message).toContain('FY2024-P1');
      expect(result[1]?.message).toContain('FY2024-P2');
    });
  });

  describe('edge cases', () => {
    it('should return empty when no dates in entries or transaction_date', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            // No fs_date
          }),
        ],
        transaction_date: undefined, // Explicitly set to undefined to override default
      });

      const result = await periodNotLocked.validate(ctx);
      expect(result).toEqual([]);
      expect(mockedEnsureAndFetchFiscalCalendar).not.toHaveBeenCalled();
    });

    it('should handle multiple entry dates, one in closed period', async () => {
      const closedPeriod = createMockFiscalPeriod({
        fiscal_year: 2024,
        period_number: 1,
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        status: 'closed',
      });

      mockedEnsureAndFetchFiscalCalendar.mockResolvedValue({
        rows: [closedPeriod],
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            fs_date: '2024-01-15', // In closed period
          }),
          createMockEntry({
            id: '2',
            fs_date: '2024-02-15', // In open period
          }),
        ],
      });

      const result = await periodNotLocked.validate(ctx);
      expect(result).toHaveLength(1);
    });

    it('should handle date range spanning multiple periods', async () => {
      const closedPeriod = createMockFiscalPeriod({
        fiscal_year: 2024,
        period_number: 1,
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        status: 'closed',
      });

      mockedEnsureAndFetchFiscalCalendar.mockResolvedValue({
        rows: [closedPeriod],
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            fs_date: '2024-01-10',
          }),
          createMockEntry({
            id: '2',
            fs_date: '2024-01-20',
          }),
        ],
      });

      const result = await periodNotLocked.validate(ctx);
      expect(result).toHaveLength(1);
      // Should query with min and max dates
      expect(mockedEnsureAndFetchFiscalCalendar).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: ctx.companyUUID,
          startYMD: '2024-01-10',
          endYMD: '2024-01-20',
          fetchTypes: ['monthly'],
          requireMonthlyOpen: false,
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle database error during fiscal calendar query', async () => {
      mockedEnsureAndFetchFiscalCalendar.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            fs_date: '2024-01-15',
          }),
        ],
      });

      await expect(periodNotLocked.validate(ctx)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });
});
