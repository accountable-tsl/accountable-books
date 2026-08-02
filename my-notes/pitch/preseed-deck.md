# Accountable Books

## $500k Pre-Seed Deck (Pre-Read Version, 11 Slides)

> Notes:
>
> - Pre-read decks should be short. Keep this to 10-12 slides.
> - Move anything optional into `my-notes/pitch/preseed-deck-appendix.md`.
> - Replace bracketed fields like [X] with real, defensible numbers.

---

## 1. Title

**Accountable Books**

AI-native accounting platform for accounting firms.

- Raise: $500,000 pre-seed
- Wedge: categorization + month-end close workbench (firm-first)
- Focus: Nigeria-first, US-ready

---

## 2. Founder-Market Fit

Founder: [Your Name]

- Chartered Accountant (Nigeria + UK), qualified at 18.
- Economics degree + Masters (distinction).
- 10+ years in accounting; ran an accounting practice with Nigeria + US/UK clients.
- Practice revenue: $100k+ per year.
- Evaluated the market deeply: 38+ tools tested; expert-level in 11; advisor-certified in 4.

Why this matters:

- Accounting correctness is the moat; you can’t outsource it and hope it works.
- This is “accountant who became the engineer” to build the system the industry needs.

---

## 3. Problem

Accounting firms scale on people, not systems.

- Categorization and close are repetitive, high-volume, and exception-heavy.
- Clients don’t know what action is required, so month-end becomes back-and-forth.
- Tools are either:
  - legacy GLs (workflows, little automation), or
  - AI automation without auditability/explainability, or
  - practice management without the accounting truth layer.

---

## 4. Solution (The Wedge)

Accountable Books turns bank activity into explainable, reviewable books.

- Ingest transactions (Plaid US, Mono Nigeria, CSV).
- Suggest journals via rules + ML with traceability.
- Human review workflow for exceptions.
- Ledger becomes the source of truth; accounting edits are versioned.

Core promise:

- Clients always know what action is required.
- Bookkeepers always know what to do next.
- Every number drills to evidence.

---

## 5. Product Proof (What Exists Today)

Built (working in codebase):

- Bank connections + transaction ingestion (Plaid US, Mono Nigeria) + CSV upload.
- Categorization engine with explicit states: unresolved -> candidate -> posted.
- Double-entry ledger + manual journals + recurring journals.
- Multi-currency foundations + FX exposure logic (posting rules and positions).
- Fiscal calendar + trial balance endpoint (backend).
- AI assist posture: assistive + confirmation-gated for mutations.

Screenshot checklist:

- Categorization queue (candidate vs posted vs unresolved).
- Journal detail and audit history.
- Bank account insights and sync status.

---

## 6. How It Works (1 Slide System View)

1. Ingest bank transactions.
2. Run rules, then ML prediction to propose entries.
3. Write candidates (suggestions) and post to ledger when approved (or autopost when allowed).
4. Human reviews exceptions; accounting edits create a new ledger version.
5. Close + financials read from ledger-derived balances with drill-through.

---

## 7. Why We Win

We are not “QuickBooks with AI”.

- Firm-first operating model (B2B2C): one firm manages many client books.
- Explainable and audit-safe by design: candidate vs posted separation + drill paths.
- Multi-geo posture from day one: Nigeria + US.
- Ledger-first foundation enables expansion into compliance and other modules without rewrites.

Competitive framing (simple):

- Kick/Digits: SMB-direct.
- Karbon/Keeper/TaxDome: workflow, not accounting truth.
- QBO/Xero: legacy automation posture.

---

## 8. Business Model

Firm-billed SaaS (B2B2C):

- Per client book per month, tiered by volume/features.
- Add-ons: exports/evidence packs, close controls, compliance artifacts, payroll.

Why it works:

- Land a firm, expand within their portfolio.
- Switching costs increase once workflows and history live in the system.

---

## 9. Go-To-Market

Phase 1 (0-6 months): Design partners

- Onboard [10-20] accounting firms.
- Prove outcomes: close throughput, reduced client back-and-forth, faster readiness.
- Founder-led onboarding + concierge migration.

Phase 2 (6-18 months): Scale channel

- Referrals firm-to-firm.
- Partnerships: associations, training programs, bank/payment ecosystems.

---

## 10. Roadmap (What $500k Unlocks)

Ship the minimum investor-grade v1 close loop:

- Close Hub + Trial Balance UI (backend already supports TB endpoint).
- P&L + Balance Sheet UI with drill-through to ledger -> source.
- Role-aware dashboards with Action Center + data reliability strip.
- Client-firm workflows: invite, assignments, “needs client input” tasks.
- Export: PDF/CSV/XLS for statements and evidence packs.

Targets (by [date]):

- [10] design-partner firms live.
- [300-1,000] client books managed through the system.
- Instrument ML evaluation + start collecting labeled corrections.

---

## 11. The Ask

Raise:

- $500,000 pre-seed (SAFE / convertible note)
- Target close: [Month 2026]

Use of funds:

- Engineering + product: [~60%]
- GTM + pilots: [~25%]
- Infra + banking/data costs: [~15%]

Milestones:

- v1 close loop shipped and in production pilots.
- Clear traction metrics (design partner conversions, book volume, close time saved).
