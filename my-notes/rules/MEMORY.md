# Accountable Books — Working Memory

## Design Principles (earned through period picker iteration)

See [design-principles.md](design-principles.md) for the full breakdown.

Core: **Think about the user first, then design the UI.** "Founder thinks X, CPA thinks Y" → design follows.

## Project Conventions

- Package manager: **pnpm** (never npm/yarn)
- UI components: Radix UI primitives via `@/components/ui/*`
- Responsive: `useIsMobile()` from `@/shared/hooks/use-media-query` (768px breakpoint)
- Styling: Tailwind CSS, `cn()` from `@/lib/utils`
- State: React useState/useRef, no global state manager for UI state
- Session: `useSession()` from `@session` for user/company context

## Key Architecture Decisions

- Dashboard: Overview tab uses simple `PeriodSelector`; report tabs use `ReportToolbar` + `ReportPeriodPicker`
- Report toolbar scoped to statement canvas (left grid), not full page width
- Period mode inferred from selection — no separate mode selector
- Company `reportingFramework` drives statement nomenclature via `getIncomeStatementNomenclature()`
