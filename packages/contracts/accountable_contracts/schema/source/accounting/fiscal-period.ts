import { z } from 'zod';

// =============================================================================
// Fiscal Period Enums
// =============================================================================

export const fiscalCalendarStatus = z.enum(['open', 'closed', 'locked']);
export type FiscalCalendarStatus = z.infer<typeof fiscalCalendarStatus>;

export const fiscalPeriodType = z.enum(['monthly', 'quarterly', 'yearly']);
export type FiscalPeriodType = z.infer<typeof fiscalPeriodType>;

// =============================================================================
// Period Status Response
// =============================================================================

export type PeriodStatusResponse = {
  status: FiscalCalendarStatus;
  periodInfo?: {
    id: string;
    periodType: FiscalPeriodType;
    fiscalYear: number;
    periodNumber: number;
    startDate: string;
    endDate: string;
  };
};
