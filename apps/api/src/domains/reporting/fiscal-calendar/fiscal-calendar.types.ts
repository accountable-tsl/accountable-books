import z from 'zod';

export const fiscalPeriodType = z.enum(['monthly', 'quarterly', 'yearly']);
export type FiscalPeriodType = z.infer<typeof fiscalPeriodType>;

export const fiscalCalendarStatus = z.enum(['open', 'closed', 'locked']);
export type FiscalCalendarStatus = z.infer<typeof fiscalCalendarStatus>;

const newFiscalCalendar = z
  .object({
    company_id: z.uuid(),
    fiscal_year: z.number().int().min(1900).max(9999),
    period_number: z.number().int().min(1).max(12),
    period_type: fiscalPeriodType,
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: fiscalCalendarStatus.optional().default('open'),
    closed_at: z.date().nullish(),
    closed_by_id: z.uuid().nullish(),
    locked_at: z.date().nullish(),
    locked_by_id: z.uuid().nullish(),
    status_changed_at: z.date().optional(),
    status_changed_by_id: z.uuid().nullish(),
    created_at: z.date().optional(),
    updated_at: z.date().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.end_date < value.start_date) {
      ctx.addIssue({
        code: 'custom',
        message: 'end_date must be on or after start_date',
        path: ['end_date'],
      });
    }

    const periodNumberValid =
      (value.period_type === 'monthly' &&
        value.period_number >= 1 &&
        value.period_number <= 12) ||
      (value.period_type === 'quarterly' &&
        value.period_number >= 1 &&
        value.period_number <= 4) ||
      (value.period_type === 'yearly' && value.period_number === 1);

    if (!periodNumberValid) {
      ctx.addIssue({
        code: 'custom',
        message: 'period_number is invalid for period_type',
        path: ['period_number'],
      });
    }

    if (value.status === 'open') {
      if (
        value.closed_at ||
        value.closed_by_id ||
        value.locked_at ||
        value.locked_by_id
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'open periods cannot have close or lock metadata',
          path: ['status'],
        });
      }
      return;
    }

    if (value.status === 'closed') {
      if (!value.closed_at || !value.closed_by_id) {
        ctx.addIssue({
          code: 'custom',
          message: 'closed periods require closed_at and closed_by_id',
          path: ['status'],
        });
      }
      if (value.locked_at || value.locked_by_id) {
        ctx.addIssue({
          code: 'custom',
          message: 'closed periods cannot have lock metadata',
          path: ['status'],
        });
      }
      return;
    }

    if (!value.locked_at || !value.locked_by_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'locked periods require locked_at and locked_by_id',
        path: ['status'],
      });
    }

    if (!value.closed_at || !value.closed_by_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'locked periods require closed_at and closed_by_id',
        path: ['status'],
      });
    }
  });

export { newFiscalCalendar };

export interface FiscalCalendar {
  id: string;
  company_id: string;
  fiscal_year: number;
  period_number: number;
  period_type: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string;
  status: 'open' | 'closed' | 'locked';
  closed_at?: Date | null;
  closed_by_id?: string | null;
  locked_at?: Date | null;
  locked_by_id?: string | null;
  status_changed_at?: Date;
  status_changed_by_id?: string | null;
  created_at: Date;
  updated_at: Date;
  metadata?: Record<string, unknown>;
}

export interface NewFiscalCalendar {
  company_id: string;
  fiscal_year: number;
  period_number: number;
  period_type: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string;
  status?: 'open' | 'closed' | 'locked';
  closed_at?: Date | null;
  closed_by_id?: string | null;
  locked_at?: Date | null;
  locked_by_id?: string | null;
  status_changed_at?: Date;
  status_changed_by_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface FiscalPeriodResponse {
  id: string;
  companyId: string;
  fiscalYear: number;
  periodNumber: number;
  periodType: 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  endDate: string;
  status: 'open' | 'closed' | 'locked';
  closedAt?: string;
  closedById?: string;
  lockedAt?: string;
  lockedById?: string;
  statusChangedAt: string;
  statusChangedById?: string;
  metadata: Record<string, unknown>;
}

export interface FiscalPeriodValidation {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export const periodStatusQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type PeriodStatusQuery = z.infer<typeof periodStatusQuery>;

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

// Job data interfaces for fiscal calendar queue
export type FiscalCalendarJobType =
  | 'generate-calendar'
  | 'auto-extend'
  | 'fill-coverage-gaps';

export interface GenerateCalendarJobData {
  type: 'generate-calendar';
  companyId: string;
  yearsBack?: number; // Default: 2
  yearsForward?: number; // Default: 10
  periodTypes?: FiscalPeriodType[]; // Default: all three
  triggeredBy: 'company_creation' | 'manual' | 'migration';
  userId?: string;
}

export interface AutoExtendJobData {
  type: 'auto-extend';
  companyId: string | 'all';
  minFutureMonths?: number; // Default: 24
  triggeredBy: 'scheduled' | 'manual';
  userId?: string;
}

export interface FillCoverageGapsJobData {
  type: 'fill-coverage-gaps';
  companyId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  periodTypes?: FiscalPeriodType[]; // Default: all three
  triggeredBy: 'import' | 'manual' | 'settings_change';
  userId?: string;
}

export type FiscalCalendarJobData =
  | GenerateCalendarJobData
  | AutoExtendJobData
  | FillCoverageGapsJobData;

// Coverage report interface
export interface CoverageReport {
  companyId: string;
  periodType: FiscalPeriodType;
  earliestPeriodStart: string | null;
  latestPeriodEnd: string | null;
  totalPeriods: number;
  futureMonthsCovered: number;
  needsExtension: boolean;
  gaps: Array<{
    startDate: string;
    endDate: string;
  }>;
}

// Generation options
export interface GenerationOptions {
  yearsBack: number;
  yearsForward: number;
  periodTypes: FiscalPeriodType[];
  baseDate?: Date; // Default: today
}

export interface FiscalPeriodYMD {
  fiscalYear: number;
  periodNumber: number;
  startYMD: string;
  endYMD: string;
}

export type ExtendResult = {
  extended: boolean;
  periodsAdded: number;
  newCoverageEndDate: string | null;
};
