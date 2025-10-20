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
