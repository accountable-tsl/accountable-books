# PAYE YTD (Cumulative) Computation — Implementation Plan (apps/web-payroll)

## Context (why this change)
Nigerian PAYE is typically computed using a **cumulative (Year-to-Date / YTD) approach**:

- Maintain **YTD taxable figures** (income, relief inputs like rent, allowable deductions, etc.)
- **Annualize** using the average-to-date (YTD ÷ months worked × 12)
- Compute **projected annual tax**, convert to **tax due YTD**, then:
- **PAYE for current month = (tax due YTD) − (tax withheld in previous months)**

This prevents incorrect month-by-month tax when income fluctuates (e.g., Q1 salary vs April bonus).

## Goals
- Compute PAYE using **finalized prior runs** in the same tax year (Jan..current month).
- Use **strict employee matching** (employeeRefId or taxId), **no name fallback**.
- Add **data integrity safeguards**:
  - no duplicate employees in a run (for the matching key)
  - no more than one finalized run per company per month (YTD source-of-truth)
  - detect gaps/ambiguities and fail or warn deterministically
- Add a **company setting flag** (hidden) `enableYtd` to disable YTD when needed.
- Keep the tool “local-first”: derive YTD from stored runs rather than requiring extra server state.
- Tax year is strictly **Jan 1 → Dec 31** (month keys `YYYY-01`..`YYYY-12`).

## Non-goals (first iteration)
- Full support for **multi-period runs** (quarterly/annual/custom) in YTD PAYE.
- Full **join/exit date proration** if the current compute engine doesn’t support it yet.
- A full “revision history” model (superseding finalized runs) beyond “one finalized run per month”.

## Current state (what exists today)
- `apps/web-payroll/src/payroll/compute/compute-run.ts` currently:
  - computes statutory items and net pay
  - leaves PAYE as a placeholder (only manual overrides are stored)
- Finalized runs are stored with a `computed` snapshot; runs are discoverable via the runs index.
- Important constraint for implementation: only rely on modules under `actions/`, `compute/`, `data/`, `domain/`, `storage/`, `ui/`.
  - We can learn from older code outside these folders, but we will not import/use it directly.

## Key design decision: derive YTD from finalized run history (don’t store YTD per employee)
### Why
- YTD is a **pure function of prior finalized runs**.
- Storing YTD separately introduces drift and hard-to-debug reconciliation problems.
- Using finalized runs as source of truth is auditable: “this month’s PAYE came from these runs”.

### What we will store
- We will **not** persist a separate “YTD state table” as a source-of-truth.
- We **will** store derived YTD figures inside the finalized run’s `computed` snapshot so the UI can show:
  - YTD gross/taxable income inputs used
  - projected annual figures
  - tax due YTD
  - tax withheld before current month
  - PAYE for the current month

This keeps correctness tied to history, while still giving the UI the YTD totals you want in “view details”.

## Proposed architecture
### 1) YTD history loader (finalized runs only)
Add an async utility that, given the current run:
- loads the runs index
- filters finalized runs for the same company (see “Company identity” below)
- filters to the same tax year as the run month (Jan..current month)
- loads each run blob and validates schema
- returns a month-sorted list of finalized runs

Constraint: YTD PAYE will be supported only for **single-month runs** in v1.
- If current run is multi-period and `enableYtd` is true → error with a clear message.
- If prior finalized runs are multi-period in the same year → treat as not eligible (warn) or error (we’ll decide).

### 2) Strict employee matching
Define a deterministic employee key:

1. If `PayrollRunItem.employeeRefId` exists → `ref:<uuid>`
2. Else if `employeeSnapshot.taxId` exists → `tax:<normalizedTaxId>`
3. Else → **unmatchable**

Rules:
- No name-based fallback (avoids mis-attribution).
- We will **block finalize** if any run item is missing both `employeeRefId` and `taxId`.
  - You stated employees will always have `employeeRefId`; we’ll still validate to protect data integrity.

TaxId normalization (proposed):
- trim + collapse whitespace
- uppercase
- optionally strip non-alphanumeric if real tax IDs use separators

### 3) Month-by-month “actuals” model
We do need a consistent “per month” set of inputs, not because rent is relieved monthly, but because the cumulative method needs:
- (a) YTD totals and
- (b) a consistent definition of what we’re summing.

To avoid conflating UI “gross pay” with “taxable emoluments”, we’ll define explicit buckets per employee-month:

- **Taxable income inputs**
  - base salary for the month (from compensation history / proration)
  - plus taxable one-off allowances (bonuses, arrears) — “taxable by default”
  - minus employer-side items? **No**: employer contributions are not employee-paid, so they are not allowable deductions and do not reduce taxable income under your clarified rule.
- **Allowable deductions (employee-paid only)**
  - statutory employee contributions (EE pension, EE NHF, EE NHIS) are allowable by default
  - voluntary contributions to statutory items are allowable (we’ll implement based on existing `taxTreatment` values)
  - we will list the exact `taxTreatment` values that count as allowable for both recurring and one-off deductions
- **Tax already withheld**
  - prior months’ PAYE withheld comes from those finalized runs’ computed PAYE
- **Months worked (proration)**
  - we will compute a per-month employment fraction from `joinDate`/`exitDate` and use it when annualizing (e.g., someone who joined mid-month)

This is the “consistent per-month numbers” requirement: not “gross == taxable”, but “we have a stable monthly definition for taxable emoluments and allowables”.

### 4) Cumulative PAYE computation for the current month
For each employee in the current run month:

1) Load prior finalized months in the same year (Jan..prevMonth).
2) Build YTD totals:
   - `taxableGrossYtd = Σ taxableEmolumentsThisMonth`
   - `allowableYtd = Σ allowableDeductionsThisMonth`
   - `taxWithheldYtdBefore = Σ payeWithheldThisMonth`
   - `workedMonthUnitsYtd = Σ workedMonthUnit`
3) Include the current month’s derived actuals as well (so the YTD used is “including current month”).
4) Annualize:
   - `projectedAnnualTaxableGross = (taxableGrossYtd / workedMonthUnitsYtd) * 12`
   - annualize recurring allowables if needed (we’ll decide based on how deductions are modeled; default will be to treat employee-paid statutory as recurring)
5) Compute:
   - Determine **annual rent for the tax year** from `rentHistory`:
     - “rent history shows the period covered by the rent”
     - pick all rent periods that intersect the current tax year
     - compute the tax-year annual rent amount used for relief (single annual number for that year)
   - `rentRelief = rentRelief(annualRentForYear)` (annual relief, not “monthly rent paid”)
   - `projectedAnnualTaxableIncome = projectedAnnualTaxableGross - rentRelief - projectedAnnualAllowables`
   - `projectedAnnualTax = taxBands(projectedAnnualTaxableIncome)`
   - `taxDueYtd = projectedAnnualTax * (workedMonthUnitsYtd / 12)`
6) Current month PAYE:
   - `payeThisMonth = taxDueYtd - taxWithheldYtdBefore`

This matches the approach you described (average-to-date → projected annual → tax due YTD → back out prior withheld).

## Data integrity safeguards (concrete checks)
### A) No duplicate employees per run
At compute/finalize time, ensure no two run items share the same matching key.
- Example: two entries for the same `employeeRefId` would double-count income in YTD.

### B) One finalized run per company per month
When finalizing a run:
- check runs index for same company + same month key + status `final`
- if exists: block finalization with a clear error

This avoids ambiguous YTD sources and supports deterministic computation.

### C) Missing computed PAYE in history
YTD requires “tax already withheld” from prior months.
If a prior finalized run exists but has no computed PAYE for an employee:
- fail YTD for that employee (and likely fail finalize)
- remediation:
  - recompute + re-finalize prior months, or
  - disable YTD for now (`enableYtd=false`)

### D) Detect gaps (warn, don’t block by default)
Gaps can be legitimate (employee joined later / no payroll run performed).
But they can also indicate incomplete YTD data.

Proposed behavior:
- If finalized months exist in the year but some months between Jan and current are missing:
  - surface a non-blocking warning (“YTD may be incomplete if payroll wasn’t finalized for missing months”)

## Company identity (how we decide “same company”)
Stable grouping key for runs:
1) Prefer `companyId` when present (stable UUID)
2) Otherwise fallback to `companyName` (less reliable)

If `companyId` is missing, we can still compute locally, but we should warn about ambiguity.

## Company setting: hidden `enableYtd` flag
Add `enableYtd?: boolean` under `PayrollRun.settings` (and/or company defaults), defaulting to true.

Behavior:
- When false: fall back to non-YTD mode (monthly-only) or leave PAYE undefined for manual override.
- When true: use YTD logic and enforce matching/integrity requirements.

This is the escape hatch for rollout and edge cases.

## Handling retroactive changes (operational edge case)
If a user changes a past month after later months are finalized, later PAYE becomes incorrect.

Given “one finalized run per month”, an operational policy is:
- to correct a past month: delete/unfinalize and re-finalize that month, then re-finalize later months.

Guardrail:
- if finalizing a month while later months in the year are already finalized, warn that later months may need recomputation.

## Implementation steps (what I’ll change in code)
1) Add `enableYtd` setting to `PayrollRunSettingsSchema` (hidden, default true).
2) Implement a run-history loader:
   - load finalized runs for same company/year up to current month
   - enforce “single-month only” for YTD v1
3) Implement strict employee keying:
   - `getEmployeeMatchKey(runItem)` and `normalizeTaxId(...)`
4) Implement employment proration (join/exit):
   - implement a compute-local `getEmploymentFractionForMonth(...)` based on `joinDate`/`exitDate`
   - use it to compute `workedMonthUnitsYtd` (and to prorate month inputs where appropriate)
5) Implement YTD PAYE integrated into the compute flow:
   - compute PAYE for employees using finalized history + current month actuals
   - ensure finalized runs persist computed PAYE
6) Add finalize-time guardrails:
   - block duplicate employees in run
   - block second finalized run for same company+month
7) Add tests (Vitest):
   - variable-income example (500k Jan–Mar, 800k Apr) → April PAYE computed cumulatively
   - strict matching behavior (no name fallback)
   - duplicate employees blocked
   - duplicate finalized run blocked

## Open questions to confirm before coding
1) Confirm the exact rent interpretation:
   - Is `RentPeriod.annualRent` “annual rent for that period”, where we take the portion that falls inside the tax year and sum into a single `annualRentForYear`?
2) Confirm allowable deduction list mapping to existing domain fields:
   - Which `taxTreatment` values on recurring/one-off deductions should count as allowable (beyond statutory EE pension/NHF/NHIS)?
3) Mid-year adoption edge case (optional but important):
   - If a company starts using the tool in (say) April without Jan–Mar runs, do we:
     - require importing Jan–Mar as finalized runs, or
     - support an “opening YTD balance” per employee for the year?

Once we align on these, I’ll implement the schema changes + compute engine + safeguards + tests.
