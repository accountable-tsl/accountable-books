# Payroll Tool (2026) — MVP Scope + 7‑Day Plan

## Goal
Launch a fast, free payroll runner at `payroll.getaccountable.com` that lets Nigerian accountants/business owners:

- Import or enter employees
- Compute a monthly payroll under 2026 rules (with overrides)
- Export outputs they already need (payroll Excel, pension template, PAYE schedules)
- Optionally save company + employees for next month via account creation

## Product Principles
- **Time-to-first-export wins**: optimize for “upload → compute → export” in minutes.
- **Guest-first**: no auth required to compute/export; ask to save only after a successful run.
- **Correctness with uncertainty**: calculations are transparent, editable, and versioned; users can override computed lines.
- **PII minimization**: no server persistence until the user opts in to save.

## MVP Scope (What We Ship in Week 1)

### Supported Payroll Type
- Monthly payroll for salaried employees (primary focus).
- Allowances and deductions supported as simple line items.
- Employer and employee pension contributions (configurable).
- PAYE computed from a versioned “2026 ruleset” configuration, with per-employee override.

### Core User Flow
1. **Start (Guest)**: create a “Payroll run” in-browser.
2. **Add Employees**:
   - CSV import (template provided) and manual entry.
   - Basic validation + error report (missing state, invalid numbers).
3. **Configure Run**:
   - Pay period (month/year), company name, default state (optional), default pension settings.
4. **Compute**:
   - Gross → taxable → PAYE → net pay (and employer cost).
   - Show per-employee breakdown + totals.
5. **Review + Override**:
   - Inline edit for computed PAYE and/or taxable income adjustments (tracked as overrides).
6. **Export**:
   - Payroll Excel for upload/accounting.
   - Pension contribution template (employee/employer contributions).
   - PAYE schedule export:
     - Team-wide schedule (grouped by state).
     - Per-state schedules (download one file per state).
7. **Summary**:
   - Total gross, total PAYE, total pension, total net, employee count, states covered.
8. **Save (Optional)**:
   - After export, prompt: “Save for next month”.
   - Sign up / log in → persist the company, employees, and run.

### UI Pages (MVP)
- `/` (landing + start payroll)
- `/run/new` (wizard: import/add → configure → compute/review → export)
- `/run/:id` (saved run view when authed)
- `/account` (login/signup if the user chooses to save)

### Data Fields (Minimum)
**Employee**
- Full name (required)
- State of employment (required)
- Gross monthly pay OR (basic + allowances) (required)
- Employee pension % or amount (optional; defaulted)
- Employer pension % or amount (optional; defaulted)
- Other deductions (optional)
- Tax ID / employee ID (optional)

**Run / Company**
- Company name (required for export headers)
- Pay month/year (required)
- Default pension settings (optional)
- Ruleset version (required; e.g. `NG-2026-v1`)

### Exports (MVP)
- **Payroll Excel**: one row per employee with gross, PAYE, pension, deductions, net pay, employer cost.
- **Pension template**: one row per employee with contributions; configurable column mapping if needed.
- **PAYE schedules**:
  - “All states” workbook (one sheet per state) OR a single sheet with a `state` column.
  - “Per state” downloads for accountants who file separately.

> Note: state-specific formats vary. MVP approach: ship (1) a **generic PAYE schedule** that works for most workflows, and (2) a **small set of high-volume state templates** first (e.g. Lagos + FCT), while keeping a mapping layer so more states can be added quickly.

### Non‑Goals (Explicitly Out of Week 1)
- Payslips PDF generation
- Complex retro pay, arrears, prorations, mid-month joins/leavers
- Loans, benefit-in-kind, reimbursements with tax treatment
- Approvals workflow, multi-role permissions, audit-grade logs
- Automated bank payment files / transfers
- “Perfect coverage” of every state’s unique PAYE form without overrides

## Tech Recommendation (This Monorepo)

### Frontend App Placement
- Create a separate app: `apps/web-payroll` (Vite + React).
- Reuse shared utilities from `packages/*` where useful.

Why: faster shipping, smaller surface area, clean deployment to `payroll.getaccountable.com`, and easier future migration than embedding inside `apps/web`.

### Guest Storage Strategy (No Auth)
- Store runs locally using `IndexedDB` (preferred) or `localStorage` (fallback).
- Treat the browser as the “DB” until the user opts to save.

### Backend Persistence (When Authed)
- Use the existing API (`apps/api`) and existing Postgres instance.
- Add new payroll tables with a clear boundary (example names):
  - `payroll_companies`
  - `payroll_employees`
  - `payroll_runs`
  - `payroll_run_items` (employee snapshot + computed figures + overrides)
- Ensure every row is scoped by the existing account/org/user ownership model.

### Calculation Engine Boundary
- Create a pure TypeScript module (suggested: `packages/payroll-core`) containing:
  - Ruleset config (`NG-2026-v1`)
  - Deterministic calculation functions
  - Export builders (data → rows), with UI doing file generation

This makes later extraction into the “bigger accounting suite” straightforward.

### PWA (Optional, “Day 2+”)
Yes, it’s feasible (Vite supports it well). Recommended approach:
- Add a web app manifest + service worker caching so the tool is installable and loads fast on mobile.
- Keep offline capability limited to the UI + local runs; server calls only needed when saving authed runs.

## 7‑Day Delivery Plan (Concrete)

### Day 0 (Prep, 2–3 hours)
- Confirm exact MVP exports required (columns for payroll, pension, PAYE).
- Pick initial state templates for MVP (recommend: Generic + Lagos + FCT).
- Define the “2026 ruleset” assumptions + override policy.

### Day 1 (Scaffold + UX)
- Create `apps/web-payroll` skeleton: routing, layout, basic styling.
- Implement the wizard steps and local run state model.
- Add CSV template download + sample CSV.

### Day 2 (Employee Import + Grid Editing)
- CSV import with validation and error UX (row-level issues).
- Employee table with inline edit + add/remove.
- Local persistence to IndexedDB/localStorage.

### Day 3 (Payroll Compute v1)
- Implement `packages/payroll-core`:
  - Money handling (Decimal)
  - Computation pipeline (gross → deductions → taxable → PAYE → net)
  - Overrides support (store both computed and overridden values)
- UI breakdown per employee + totals summary.

### Day 4 (Exports)
- Implement export generators:
  - Payroll Excel
  - Pension template
  - PAYE schedule (generic + selected states)
- Validate output opens correctly in Excel and matches accountant expectations.

### Day 5 (Optional Save + Auth Integration)
- Add “Save for next month” prompt post-export.
- Implement minimal API endpoints + DB migrations to persist:
  - Company, employees, run, run items
- Ensure guest flow never uploads PII unless the user explicitly saves.

### Day 6 (Polish + PWA + Edge Cases)
- Add PWA installability (manifest + service worker caching).
- Add helpful UX:
  - Run naming (e.g. “Jan 2026”)
  - Duplicate last run (local)
  - Bulk edit defaults (state, pension)
- Add basic analytics events (start run, import success, export success, save intent).

### Day 7 (QA + Deploy + Launch)
- Smoke test with real accountant sample files.
- Add disclaimers + “assumptions & overrides” panel.
- Deploy `apps/web-payroll` to `payroll.getaccountable.com`.
- Add launch checklist: monitoring, error logging, rate limiting, basic privacy copy.

## Acceptance Criteria (MVP “Done”)
- A first-time user can upload a CSV and export payroll Excel in under 5 minutes.
- PAYE and pension outputs are produced without requiring account creation.
- Users can override computed PAYE per employee and see totals update.
- Users can optionally save the company/employees/run by creating an account after exporting.
- The app works well on mobile (responsive); PWA install is a bonus, not a blocker.

## Key Risks + Mitigations
- **Tax reforms ambiguity** → ship ruleset versioning + overrides + clear assumptions; update ruleset post-launch.
- **State template variations** → start with generic + top states; build a template mapping layer to add states quickly.
- **PII / compliance** → guest-first local storage; server persistence only after explicit “Save”.
- **Trust** → show calculation breakdowns and export previews; provide “download sample outputs”.

## Post‑MVP (Week 2+)
- Payslips (PDF), bank payment files, approvals, recurring runs
- Employee directory + onboarding improvements
- More state templates + template builder UI
- Multi-entity support for accounting firms

