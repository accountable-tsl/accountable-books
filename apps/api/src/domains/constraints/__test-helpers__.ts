import type { FiscalCalendar } from '../reporting/fiscal-calendar/fiscal-calendar.types.js';
import type {
  ConstraintContext,
  ConstraintResult,
} from './constraints-types.js';

/**
 * Create a mock constraint context for testing
 */
export function createMockConstraintContext(
  overrides?: Partial<ConstraintContext>,
): ConstraintContext {
  return {
    companyUUID: '550e8400-e29b-41d4-a716-446655440000',
    entries: [
      {
        id: 'entry-1',
        amount: 100.0,
        coa_id: '550e8400-e29b-41d4-a716-446655440001',
      },
      {
        id: 'entry-2',
        amount: -100.0,
        coa_id: '550e8400-e29b-41d4-a716-446655440002',
      },
    ],
    transaction_date: '2024-01-15',
    ...overrides,
  };
}

/**
 * Create a mock entry for testing
 */
export function createMockEntry(overrides?: {
  id?: string;
  amount?: number;
  coa_id?: string;
  fs_date?: string;
  project_id?: string | null;
  is_bank_leg?: boolean;
  system_exchange_rate?: number;
  custom_exchange_rate?: number;
}): ConstraintContext['entries'][0] {
  return {
    id: overrides?.id ?? `entry-${Math.random().toString(36).substr(2, 9)}`,
    amount: overrides?.amount ?? 100.0,
    coa_id: overrides?.coa_id ?? '550e8400-e29b-41d4-a716-446655440001',
    ...(overrides?.fs_date !== undefined && { fs_date: overrides.fs_date }),
    ...(overrides?.project_id !== undefined && {
      project_id: overrides.project_id,
    }),
    ...(overrides?.is_bank_leg !== undefined && {
      is_bank_leg: overrides.is_bank_leg,
    }),
    ...(overrides?.system_exchange_rate !== undefined && {
      system_exchange_rate: overrides.system_exchange_rate,
    }),
    ...(overrides?.custom_exchange_rate !== undefined && {
      custom_exchange_rate: overrides.custom_exchange_rate,
    }),
  };
}

/**
 * Create a mock constraint result for testing
 */
export function createMockConstraintResult(
  overrides?: Partial<ConstraintResult>,
): ConstraintResult {
  return {
    code: 'unbalanced_entries',
    scope: 'entry',
    message: 'Test violation message',
    severity: 'error',
    ...overrides,
  };
}

/**
 * Create a mock fiscal period for testing
 */
export function createMockFiscalPeriod(
  overrides?: Partial<FiscalCalendar>,
): FiscalCalendar {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    fiscal_year: 2024,
    period_number: 1,
    period_type: 'monthly',
    start_date: '2024-01-01',
    end_date: '2024-01-31',
    status: 'open',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    ...overrides,
  };
}
