import z from 'zod';

export const fiscalPeriodType = z.enum(['monthly', 'quarterly', 'yearly']);
export type FiscalPeriodType = z.infer<typeof fiscalPeriodType>;

export const fiscalCalendarStatus = z.enum(['open', 'closed', 'locked']);
export type FiscalCalendarStatus = z.infer<typeof fiscalCalendarStatus>;

const newFiscalCalendar = z.object({
  company_id: z.uuid(),
  fiscal_year: z.number().min(1000).max(9999),
  period_number: z.number().min(1).max(12),
  period_type: fiscalPeriodType,
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: fiscalCalendarStatus.optional().default('open'),
  closed_at: z.date().nullish(),
  closed_by_id: z.uuid().nullish(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
  metadata: z.any().optional(),
});

export interface FiscalCalendar {
  company_id: string;
  fiscal_year: number;
  period_number: number;
  period_type: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string;
  status: 'open' | 'closed' | 'locked';
  closed_at?: Date;
  closed_by_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface NewFiscalCalendar {
  company_id: string;
  fiscal_year: number;
  period_number: number;
  period_type?: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string;
  status?: 'open' | 'closed' | 'locked';
  closed_at?: Date;
  closed_by_id?: string;
}

export interface FiscalPeriodResponse {
  companyId: string;
  fiscalYear: number;
  periodNumber: number;
  periodType: 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  endDate: string;
  status: 'open' | 'closed' | 'locked';
  closedAt?: string;
  closedById?: string;
}

export interface FiscalPeriodValidation {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

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
