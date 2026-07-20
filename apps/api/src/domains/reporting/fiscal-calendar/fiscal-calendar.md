# Fiscal Calendar System

## Overview

The fiscal calendar system manages accounting periods for companies, providing structure for financial reporting and period-based balance tracking. It supports monthly, quarterly, and yearly period types with automatic creation and manual period management.

## Core Features

### Period Types

- **Monthly**: Standard monthly periods (January, February, etc.)
- **Quarterly**: Quarterly periods (Q1, Q2, Q3, Q4)
- **Yearly**: Annual periods

### Period Status

- **Open**: Period is active and can receive transactions
- **Closed**: Period is closed and cannot receive new transactions
- **Locked**: Period is locked (future feature for additional security for sensitive periods, e.g after audit, before IPO, etc - should require higher level of authorization to reopen than closed).

## Database Schema

### fiscal_calendar Table

```sql
CREATE TABLE fiscal_calendar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  fiscal_year INTEGER NOT NULL,
  period_number INTEGER NOT NULL,
  period_type fiscal_period_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  closed_at TIMESTAMPTZ,
  closed_by_id UUID REFERENCES users(id),
  locked_at TIMESTAMPTZ,
  locked_by_id UUID REFERENCES users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (company_id, fiscal_year, period_number, period_type),
  UNIQUE (id, company_id)
);
```

Child tables reference `(fiscal_calendar_id, company_id) → (id, company_id)` for tenant isolation (same pattern as COA).

### gl_period_balances Table

```sql
CREATE TABLE gl_period_balances (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  coa_id UUID NOT NULL,
  fiscal_calendar_id UUID NOT NULL,
  opening_balance DECIMAL(18, 3) NOT NULL DEFAULT 0,
  period_debits DECIMAL(18, 3) NOT NULL DEFAULT 0,
  period_credits DECIMAL(18, 3) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(18, 3) NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (company_id, coa_id, fiscal_calendar_id),

  FOREIGN KEY (coa_id, company_id) REFERENCES coa(id, company_id),
  FOREIGN KEY (fiscal_calendar_id, company_id) REFERENCES fiscal_calendar(id, company_id),

  CONSTRAINT gl_period_balance_math_check
    CHECK (closing_balance = opening_balance + period_debits - period_credits)
);
```

## API Endpoints

### Period Management

- `GET /api/balances/fiscal-periods` - List fiscal periods for a company
- `POST /api/balances/fiscal-periods/close` - Close a fiscal period
- `POST /api/balances/fiscal-periods/reopen` - Reopen a closed period

### Period Balance Queries

- `GET /api/balances/trial-balance` - Get trial balance for a specific period
- `GET /api/balances/period-balances` - Get period balances for accounts

## Service Functions

### Core Functions

#### `getFiscalPeriodForDate(companyId, date, periodType)`

- Finds the fiscal period for a given date
- Automatically creates period if it doesn't exist
- Returns period details including status

#### `ensureFiscalPeriodExists(companyId, date, periodType)`

- Ensures a fiscal period exists for the given date
- Creates period if it doesn't exist
- Returns the period (existing or newly created)

#### `closeFiscalPeriod(companyId, fiscalYear, periodNumber, userId, periodType)`

- Closes a fiscal period with validation
- Prevents closing periods with pending transactions
- Records who closed the period and when

#### `reopenFiscalPeriod(companyId, fiscalYear, periodNumber, userId, reason, periodType)`

- Reopens a closed fiscal period
- Requires authorization and reason
- Records who reopened the period and why

### Validation Rules

#### Period Closing Validation

1. **No Pending Transactions**: Period cannot be closed if there are unposted transactions
2. **Sequential Closing**: Periods should be closed in chronological order
3. **Balance Validation**: All accounts must have valid period balances
4. **Transaction Count**: Period must have processed all transactions

#### Period Reopening Validation

1. **Authorization Required**: Only authorized users can reopen periods
2. **Reason Required**: Must provide business reason for reopening
3. **Audit Trail**: All reopenings are logged with user and reason

## Automatic Period Creation

### During Balance Recalculation

When the balance recalculation worker processes transactions:

1. **Period Detection**: Identifies which fiscal periods are affected
2. **Period Creation**: Automatically creates missing periods
3. **Balance Aggregation**: Aggregates daily snapshots to period balances
4. **Period Updates**: Updates period balances with opening/closing amounts

### Period Aggregation Process

1. **Daily Snapshot Scan**: Scans daily balance snapshots for the period
2. **Opening Balance**: Uses first day's opening balance
3. **Period Totals**: Sums debits and credits for the period
4. **Closing Balance**: Uses last day's closing balance
5. **Transaction Count**: Counts total transactions in the period

## Business Rules

### Period Lifecycle

1. **Creation**: Periods are created automatically when needed
2. **Active**: Periods are open by default and can receive transactions
3. **Closing**: Periods can be manually closed with validation
4. **Reopening**: Closed periods can be reopened with proper authorization

### Data Integrity

- **Period Balances**: Must always equal opening + debits - credits
- **Transaction Count**: Must match actual transaction count in period
- **Period Status**: Must be consistent across all related records
- **Audit Trail**: All period changes must be logged

## Performance Considerations

### Indexes

- `fiscal_calendar_date_lookup_idx`: (company_id, start_date, end_date) for date lookups
- `gl_period_balances_period_lookup_idx`: (company_id, fiscal_year, fiscal_period, period_type) for period queries

### Query Optimization

- **Period Lookups**: Use date-based indexes for fast period resolution
- **Balance Queries**: Use period balances for fast trial balance generation
- **Aggregation**: Pre-aggregated period balances avoid real-time calculation

## Integration Points

### Balance System Integration

- **Automatic Creation**: Periods created during balance recalculation
- **Balance Aggregation**: Daily snapshots automatically aggregated to periods
- **Period Validation**: Balance system validates period status before processing

### Reporting Integration

- **Trial Balance**: Uses period balances for fast generation
- **Financial Statements**: Period-based reporting uses aggregated balances
- **Audit Reports**: Period status and changes tracked for compliance

## Error Handling

### Common Scenarios

1. **Missing Period**: Automatically created during balance recalculation
2. **Invalid Period**: Validation prevents invalid period operations
3. **Concurrent Updates**: Database constraints prevent data corruption
4. **Authorization Failures**: Proper error messages for unauthorized access

### Recovery Procedures

1. **Period Recreation**: Recreate periods if accidentally deleted
2. **Balance Recalculation**: Recalculate period balances if corrupted
3. **Status Correction**: Correct period status if inconsistent
4. **Audit Trail**: Review audit logs for period changes

## Related Documentation

- [Balances domain documentation](../../balances/balances.md) - Main balances system documentation
- [Main Balances Documentation](../../../../../../docs/accounting/balances.md) - Technical specification
- [Posting Logic](../../../../../../docs/accounting/posting-logic.md) - Transaction flow documentation
