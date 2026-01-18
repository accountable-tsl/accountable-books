# Payroll module (`apps/web-payroll/src/payroll`)

## Where to start

- The main implementation file is `tax-logic.ts`.
- Supporting helpers live in `tax-logic.utils.ts`.
- Types live in `tax-logic.types.ts`.

## Core money buckets (this is the mental model)

For any employee + month, we separate money into distinct buckets so we don’t accidentally treat employer costs as employee deductions.

### Statutory (computed)

Computed statutory amounts for the month (based on salary split + enablement + policy rates):

- **Employee-side**: `eePension`, `eeNhf`, `eeNhis` (withholdings)
- **Employer-side**: `erPension`, `erNhis` (employer cost / benefit)

This lives in `inputs.statutory`.

### Deductions (scheduled; employee-side only)

These are employee **scheduled deductions** (non-statutory schedules) and are represented as NGN amounts that apply to a month:

- `voluntary_pension`
- `owner_occupied_mortgage_interest`
- `life_insurance_premium`

This lives in `inputs.deductions` and is computed from `employee.deductions`.

### Employer contributions (scheduled; employer-side only)

Employer **scheduled contributions/benefits** (do not reduce net pay), also represented as schedules:

- `voluntary_pension`
- `owner_occupied_mortgage_interest`
- `life_insurance_premium`

This lives in `inputs.employerContributions` and is computed from `employee.employerContributions`.

## Public entry points

- `computeEmployeeMonthInputs(employee, month, companyDefaults?, options?)`
  - Computes salary split + statutory + scheduled deductions + scheduled employer contributions for that month.
- `computeNigeriaCumulativePayeForMonth(employee, month, companyDefaults?, options?)`
  - Computes PAYE using the cumulative/annualised method.

