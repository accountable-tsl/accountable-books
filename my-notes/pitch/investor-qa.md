# Accountable Books: Investor Q&A (Draft)

## What exactly is the product?

An AI-native accounting platform for accounting firms that turns bank activity into explainable, reviewable books, and supports month-end close with drill-through reporting.

## Who is the initial customer?

Accounting firms and freelancers who manage multiple client books (B2B2C). They care about throughput, correctness, and reducing back-and-forth with clients.

## What is the wedge?

Transaction categorization + exception workflow + audit-safe ledger mutation model. It is the daily workflow where firms spend the most time and can immediately measure time saved.

## Why firms (B2B2C) vs SMB-direct?

- Distribution: one firm brings many clients.
- Better CAC leverage: one sales cycle unlocks portfolio expansion.
- Higher trust: firms already own the finance workflow.

## What’s meaningfully different vs “AI accounting” competitors?

- Explainability and drill paths are treated as non-negotiable product requirements, not an afterthought.
- Multi-geo posture from day one (Nigeria + US initial).
- Firm-first operating model rather than SMB-direct only.
- Ledger-first posture enables expansion into compliance modules without rewriting core truth.

## What is built today?

Working in codebase:

- Bank ingestion (Plaid US, Mono Nigeria) + CSV import.
- Categorization engine with unresolved/candidate/posted states.
- Double-entry ledger with versioning rules for edits.
- Manual journals + recurring journals.
- Multi-currency foundations and FX exposure logic.
- Fiscal calendar + trial balance endpoint (backend).

## What’s missing / what are the main execution risks?

- Reporting UI (Trial Balance, P&L, Balance Sheet) and Close Hub UX.
- Role-aware dashboards with "Action Center" and client task workflows.
- Client management flows (invite, assignment, approvals).
- ML evaluation framework and measured accuracy claims (must be instrumented).

## How does the ML flywheel work?

Every time a bookkeeper reviews or corrects a suggested categorization, the system captures a labeled example that improves tenant-specific ranking and global intent classification. Firms provide concentrated, high-quality labels across many books.

## How do you avoid “black box accounting” risk?

By design:

- Suggestions are candidates, not books, until posted.
- Destructive/mutating actions require explicit confirmation in structured UI.
- Ledger edits that change accounting meaning are versioned; candidates remain immutable history.
- Drill-down paths from numbers to source evidence are non-negotiable.

## How do you make money?

Firm-billed SaaS:

- Per client book per month, with tiers by volume and advanced features.
- Add-ons: exports/evidence packs, compliance artifacts, payroll, advanced approvals.

## Go-to-market plan?

- Design partner firms (10-20) with concierge onboarding.
- Prove month-end close throughput improvement and reduction in client back-and-forth.
- Expand within each firm portfolio; build referral loops firm-to-firm.
- Partnerships: associations, training programs, bank/payment ecosystems.

## What does $500k unlock?

- Shipping the v1 close loop (Trial Balance UI + P&L + Balance Sheet + exports).
- Onboarding 10-20 firms and 300-1,000 client books.
- Instrumentation for ML evaluation, model iteration, and operational metrics.

## How is the company structured (US vs Nigeria)?

Draft answer (confirm details before using):

- IP and fundraising entity at the US parent.
- Nigeria operating entity licensed for Nigeria go-to-market.
- Any affiliated accounting practice (if present) is separate, dogfoods the product, and acts as a feedback loop.

## What do you need from investors besides capital?

- Introductions to accounting firms and influential operators.
- Regulatory/compliance insight where applicable.
- Help recruiting early engineering and GTM hires.

## How do you talk about “sales” / being introverted?

Do not put “I’m not good at sales” in the deck.

Use this framing in conversation:

- I’m product and domain-led: I built this because I ran the practice and lived the pain.
- Early GTM is design-partner driven: pilots, concierge onboarding, measurable time saved.
- I will hire for complementary strengths as soon as pull exists (partnerships/channel), but at pre-seed the highest leverage is shipping the close loop and getting firms live.
