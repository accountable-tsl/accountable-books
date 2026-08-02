# Accountable Books — $500K Pre-Seed Deck (Recommended)

> **Recommended merge** of Cursor plan + Claude plan + your deck.  
> Pre-read / cold-send. 12 slides. Replace bracketed fields with real numbers.  
> Optional: add speaker notes from `pitch-deck-500k-preseed.md` when presenting live.

---

## 1. Title

**Accountable Books**

AI-native accounting platform for accounting firms.

- **Raising:** $500,000 pre-seed (SAFE / convertible note)
- **Wedge:** Explainable categorization + month-end close workbench (firm-first)
- **Focus:** Nigeria-first, US-ready

getaccountable.com

---

## 2. Founder–Market Fit

**[Your name]**

- **Chartered Accountant** (Nigeria + UK), qualified at 18 — among the youngest in Africa.
- **Economics** degree + Masters (distinction). ~10 years in accounting.
- **Ran own practice:** multi-country clients (Nigeria, US, UK). **$100k+ revenue per year.**
- **Market depth:** 38+ accounting and practice-management tools tested; expert in 11, advisor-certified in 4.
- **Why I built this:** Hired a developer to build the product; they couldn’t get double-entry and GAAP right. I shut the practice, did a software + AI engineering bootcamp, and built the platform myself. I’m building the infrastructure I wish existed when I ran my firm.

**Why it matters:** Accounting correctness is the moat. This is an accountant who became the engineer — so the system is built on real accounting, not approximated.

---

## 3. Problem

Accounting firms scale on people, not systems.

- **Categorization and close** are repetitive, high-volume, exception-heavy. 60–80% of bookkeeping time goes to categorization.
- **Clients don’t know what’s required** → month-end becomes back-and-forth. Bookkeepers don’t have a single queue of “what to do next.”
- **Tools don’t fit:**
  - Legacy GLs (QuickBooks, Xero): built for business owners, not firms managing 30–300 client books.
  - AI automation: often no auditability or explainability.
  - Practice management (Karbon, TaxDome): workflow and CRM, not the accounting truth layer.
- **Emerging markets:** Nigeria, Kenya, Ghana have effectively no modern firm-focused tooling.
- The industry scales on headcount. It should scale on intelligence.

---

## 4. Why Now

- **AI in accounting** is the fastest-growing fintech subsegment: ~$11B market, **44.6% CAGR**.
- **$400M+** raised by AI accounting startups in the last 18 months (Rillet, Campfire, Accrual, Puzzle, Digits, Kick).
- **Every dollar went to US SMB-direct or enterprise.** No one is building AI-native bookkeeping for accounting firms. No one supports emerging markets.
- **Explainability is table stakes:** CFOs and auditors want to know _why_ the AI decided, not just what it decided. Black-box AI is a liability in accounting.

---

## 5. Solution (The Wedge)

Accountable Books turns bank activity into **explainable, reviewable books** — built for firms from day one.

- **Ingest** — Plaid (US), Mono (Nigeria), CSV. Multi-geography from day one.
- **Classify** — Rules + ML with confidence scores and reasoning. Human review for exceptions; no silent posting.
- **Post** — Double-entry ledger with audit trail. Every number traces to source evidence.
- **Close & report** — Trial balance, P&L, Balance Sheet with drill-through (spec locked; UI shipping).

**Core promise:**  
Clients always know what action is required. Bookkeepers always know what to do next. Every number drills to evidence.

---

## 6. Product Proof (What Exists Today)

**Built and working:**

- Bank connections + transaction ingestion (Plaid US, Mono Nigeria) + CSV upload.
- Categorization engine with explicit states: unresolved → candidate → posted. ML suggestions with traceability.
- Double-entry ledger + manual journals + recurring journals. Constraint validation, versioning on edits.
- Multi-currency + FX exposure logic. Fiscal calendar. Trial balance endpoint (backend).
- Multi-tenant RBAC. AI assist: assistive and confirmation-gated for mutations.

**Shipping next (v1 close loop):**

- Close Hub + Trial Balance UI. P&L + Balance Sheet UI with drill-through.
- Role-aware dashboards (Action Center, data reliability strip). Client–firm workflows (invite, “needs client input”).

**Screenshot checklist for deck:** Categorization queue (candidate vs posted) · Journal detail + audit history · Bank accounts + sync status · [Optional] Company switcher / firm context.

---

## 7. How It Works

1. **Ingest** — Bank transactions flow in (Plaid / Mono / CSV).
2. **Classify** — Rules first, then ML. Proposals become candidates; confidence and reasoning visible.
3. **Review** — Bookkeeper works from a queue. Approve, edit, or reject. No mutation without explicit confirm.
4. **Post** — Validated entries hit the ledger. Debits = credits. Append-only style; corrections are new entries.
5. **Close & report** — Balances and statements with full drill-through to source.

**Data flywheel:** Every bookkeeper correction improves the model. More firms → better AI.

---

## 8. Why We Win (Competition)

We are not “QuickBooks with AI.”

|                    | **Built for SMBs**                            | **Built for firms**                                   |
| ------------------ | --------------------------------------------- | ----------------------------------------------------- |
| **AI-native**      | Kick, Digits, Puzzle (SMB-direct)             | **Accountable Books**                                 |
| **Legacy / other** | QuickBooks, Xero (legacy; weak firm workflow) | Karbon, TaxDome (workflow only; no accounting engine) |

- **Kick / Digits / Puzzle:** SMB-direct. No multi-client firm workflow; no emerging markets.
- **Rillet / Campfire:** Enterprise ERP. Not built for mid-market firms.
- **Accrual:** Tax prep for firms; not full bookkeeping.
- **Karbon / TaxDome:** Practice management — no accounting truth layer.

**No one combines:** AI-native + built for firms + multi-geography (US + Nigeria).  
**$400M+ in the space validates the thesis; our quadrant is empty.**

---

## 9. Business Model & Market

**Model:** B2B2C — sell to accounting firms; they serve clients.

- **Pricing:** Per client book per month (e.g. $30–100/client), tiered by volume/features.
- **Unit economics:** One firm = 30–300 clients → $1K–$30K MRR per firm.
- **Add-ons:** Exports/evidence packs, close controls, compliance, payroll.
- **Stickiness:** Once client data and workflows live in the system, switching cost is high.

**Market (bottom-up):**

- Global accounting software ~$21B+; AI subsegment growing ~44.6% CAGR.
- **Firms:** ~46k (US) + ~25k (Nigeria) = **71k+** addressable.
- **Year 1 target:** 50–100 pilot firms → **$500K–$2M ARR** potential.

---

## 10. Go-to-Market

**Phase 1 (0–6 months): Design partners**

- Onboard [10–20] accounting firms (US + Nigeria).
- Prove outcomes: close throughput, less client back-and-forth, faster readiness.
- Founder-led onboarding and concierge migration.

**Phase 2 (6–18 months): Scale**

- Referrals firm-to-firm. Partnerships: associations (e.g. AICPA, ICAN), training, bank/payment ecosystems.

---

## 11. Roadmap & The Ask

**What $500K unlocks**

- Ship v1 close loop: Close Hub + Trial Balance UI, P&L + Balance Sheet, role-aware dashboards, client–firm invite and task workflows.
- Onboard [10–20] design-partner firms; [300–1,000] client books in the system.
- Instrument ML evaluation and start collecting labeled corrections.

**Use of funds**

| Allocation            | %    | Purpose                                                     |
| --------------------- | ---- | ----------------------------------------------------------- |
| Engineering + product | ~60% | Complete MVP, dashboards, reporting UI; optional first hire |
| Go-to-market + pilots | ~25% | Beta program, firm partnerships                             |
| Infra, banking, ops   | ~15% | Cloud, APIs, legal, buffer                                  |

**Milestones (12 months)**

| Window      | Target                                                    |
| ----------- | --------------------------------------------------------- |
| 1–2 months  | v1 close loop shipped (dashboards + financial statements) |
| 2–4 months  | 10–20 firms onboarded (US + Nigeria)                      |
| 4–6 months  | 50K+ categorized transactions; ML training loop active    |
| 6–12 months | 50+ active firms; clear PMF signals; seed-ready metrics   |

**Raising:** $500,000 pre-seed. Target close: [Month 2026].

---

## 12. Close

The product exists. The architecture is production-grade. The market is validated by $400M+ in the space.

Every funded competitor targets US SMBs or enterprise. No one is building AI-native bookkeeping for accounting firms. No one supports emerging markets.

One firm = dozens of clients. Multi-geography is the wedge.

**$500K → v1 close loop + design partners → seed-ready in 12 months.**

**getaccountable.com**  
[Your email] | [Calendar link]

---

## Optional one-liner (if asked about security)

We take security and tenant isolation seriously; company-scoped access is enforced across the product. [Ensure `checkCompanyId` and auth hardening are done before sharing with investors.]
