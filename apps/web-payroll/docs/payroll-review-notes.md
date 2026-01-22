# Payroll Review Notes (Web Payroll)

Purpose: track critical paths, must-work behaviors, known issues, and required
tests so we can confirm each item is fixed later.

## Assumptions / Decisions
- Rent periods represent TOTAL rent for the period (not monthly).
- Annual rent is derived from rent history for the target tax year (Jan-Dec).
- YTD PAYE uses finalized runs within the same tax year (single-month runs only).

## Decision Log
- 2026-xx-xx: Rent periods are total for the period; annual rent must be derived
  per tax year, and open-ended periods should be capped to the tax year end when
  computing annual rent for that year.

## Critical Paths (Must Not Break)
- Run lifecycle: create run -> add employees -> compute -> finalize -> export.
- YTD pipeline: load finalized runs -> extract YTD totals -> compute PAYE.
- Statutory deductions: pension/NHF/NHIS with correct precedence (employee > company > system).
- Employment proration: join/exit dates affect monthly fractions across compute and YTD.
- Storage integrity: runs index, runs, company defaults, employee directory.

## Must-Work Behaviors
- Finalize prevents empty run or zero gross runs; warns on gaps and conflicts.
- PAYE uses Nigerian 2026 bands, minimum wage exemption, rent relief cap.
- Exempt income is excluded from tax, but still paid out and reflected in employer cost.
- Overrides replace computed values without breaking totals.
- CSV export matches computed values (not stale compensation history).

## Findings / Fix Queue
- P1: Exempt one-off allowances are excluded from net pay/employer cost.
  - Impact: tax-free payments are not paid out.
  - Files: `apps/web-payroll/src/payroll/compute/compute-run.ts`
  - Status: TODO
- P1: Open-ended rent periods are treated as 100-year spans, making annual rent
  near zero and suppressing rent relief.
  - Impact: rent relief is almost always wrong for open-ended periods.
  - Files: `apps/web-payroll/src/payroll/compute/compute-run.ts`
  - Status: TODO
- P2: YTD statutory deductions ignore explicit B/H/T values from compensation
  periods, which can diverge from monthly compute.
  - Files: `apps/web-payroll/src/payroll/compute/extract-ytd.ts`
  - Status: TODO
- P2: BHT breakdown inference uses the first compensation period instead of the
  period that matches the current month.
  - Files: `apps/web-payroll/src/payroll/compute/resolve-settings.ts`
  - Status: TODO
- P2: Table + CSV export use the first compensation period for monthly gross,
  which can disagree with computed/prorated values.
  - Files: `apps/web-payroll/src/payroll/ui/payroll-table-utils.ts`
  - Status: TODO
- P3: Finalize flow does not surface compute errors (e.g., missing compensation).
  - Files: `apps/web-payroll/src/payroll/ui/payroll-app.tsx`
  - Status: TODO
- P3: Payroll README references removed files (tax-logic.*).
  - Files: `apps/web-payroll/src/payroll/README.md`
  - Status: TODO

## Rent Computation Recommendation
- Current: annual rent is computed by splitting each rent period into monthly
  amounts across its full duration; open-ended uses a far-future end, which
  makes monthly rent tiny.
- Proposed fix (preferred):
  - Treat an open-ended period as ending at the tax year end (YYYY-12) when
    computing annual rent for that tax year.
  - Use the intersection between the rent period and the tax year when
    computing the monthly rent amount for that year.
  - This preserves the "total for period" meaning and avoids 100-year dilution.

## Required Tests (Unit -> Integration)

### Unit: PAYE Computation
- Tax band calculations across boundaries.
- Minimum wage exemption (annual gross <= 840k yields zero tax).
- Rent relief at 20% with 500k cap.
- YTD flow: workedMonthUnits/taxWithheldYtd required; negative PAYE clamps to 0.

### Unit: Payroll Compute
- BHT split precedence: explicit B/H/T vs rates vs default 100% basic.
- Statutory deductions with rate vs amount overrides (pension/NHF/NHIS).
- Employment proration across all methods (calendar, 30/360, business days, full month).
- One-off allowances: taxable vs exempt; loss-of-employment cap (50M).
- Allowable deductions: recurring vs one-off, correct tax treatment buckets.
- Overrides: replace computed values and adjust net totals predictably.
- Rent relief: open-ended rent periods produce correct annual rent for tax year.

### Unit: YTD Extraction
- Runs filtering: same company, same year, finalized only, single-month only.
- Employee matching: refId then taxId, no name matching.
- Annualization: recurring deductions annualized; one-off deductions not.
- Loss-of-employment cap applied across multiple months.
- Proration affects workedMonthUnits and projections.

### Unit: Storage / Domain
- saveRun updates runs index and labels.
- findExistingFinalizedRun detects conflicts by period/company.
- loadRunsIndex returns empty on invalid data.
- Employee directory upsert/delete.

### Integration: UI + Compute
- Create run -> add employee -> compute -> finalize -> reload shows computed.
- Finalize with conflicting run triggers override flow.
- Month gaps warning appears but does not block finalization.
- Export CSV matches computed values (including one-off allowances/deductions).
- Reset clears runs index, runs, employee directory, company defaults.

## Confirmation Checklist
- [ ] P1 exempt allowances paid out in net pay and employer cost.
- [ ] P1 rent relief correct for open-ended rent periods.
- [ ] P2 YTD uses explicit B/H/T when present.
- [ ] P2 breakdown resolution uses correct comp period for month.
- [ ] P2 table/export values match compute output.
- [ ] P3 compute errors surfaced during finalize.
- [ ] P3 README updated to reflect current module layout.
