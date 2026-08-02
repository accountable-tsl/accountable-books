# Accountable — $500K Pre-Seed Pitch Deck

> **Format**: Each slide has a title, content bullets, and speaker notes.
> Designed for cold-send. Paste directly into Keynote, Google Slides, PowerPoint, or Pitch.
> Screenshots needed for Slide 5 — marked with [SCREENSHOT] placeholders.

---

## SLIDE 1 — Title

### Accountable

**AI-native bookkeeping for accounting firms**

Raising $500K pre-seed

getaccountable.com

---

**Speaker notes:**
This is the cold-open. The tagline does three things in seven words: (1) signals AI-native, not bolted-on; (2) names the product category — bookkeeping; (3) names the buyer — accounting firms. Investors should immediately know what this is, who it's for, and that it's fundable.

---

## SLIDE 2 — The Problem

### Accounting firms are stuck scaling on headcount

- A typical firm manages **30–300 client books**. Every one of them is manual, repetitive work.
- **60–80% of bookkeeping time** goes to transaction categorization — the same task, repeated thousands of times per client per month.
- Existing tools are built for business owners, not for the firms doing the actual work.
  - **QuickBooks / Xero**: designed for the SMB owner, not the accountant managing 50 clients.
  - **Karbon / TaxDome**: practice management — workflow and CRM, not actual accounting.
- The fastest-growing markets — Nigeria, Kenya, Ghana — have **zero modern tooling**.
- The industry scales on headcount. It should scale on intelligence.

---

**Speaker notes:**
The key insight: accounting firms are the power users of bookkeeping software, yet every major product is designed for the end client (the small business owner), not the firm. This creates a fundamental UX mismatch — firms work across dozens of clients simultaneously, but every tool forces them into one-client-at-a-time workflows. And the emerging markets that produce 25,000+ accounting professionals have no modern tools at all. This is not a feature gap — it's a category gap.

---

## SLIDE 3 — Why Now

### $400M+ just validated our thesis

- **AI in accounting**: $10.87B market growing at **44.6% CAGR** — the fastest-growing subsegment in fintech.
- In the last 18 months alone:
  - Rillet raised **$100M+** (a16z, Sequoia)
  - Campfire raised **$103M** (Accel, Ribbit)
  - Accrual launched with **$75M** (General Catalyst)
  - Puzzle raised **$66M**, Digits **$97M**, Kick **$20M**
- Every dollar went to **US SMB-direct** or **enterprise ERP**.
- **No one is building for accounting firms.** No one supports emerging markets.
- 2026 is the year CFOs demand **explainability** — they want to know _why_ the AI made a decision, not just what it decided.

---

**Speaker notes:**
This slide answers the investor's first instinct: "Is this a real market?" The answer is emphatic — $400M+ in 18 months proves the thesis. But every funded competitor is chasing the same angle: US SMB-direct or enterprise. That leaves a clear white space: AI-native bookkeeping built for accounting firms, with multi-geography support. The explainability point is important — as AI tools mature, the firms that can explain their numbers to auditors and regulators will win. Black-box AI is a liability in accounting.

---

## SLIDE 4 — The Solution

### Accountable: AI bookkeeping, built for firms

- **Auto-categorize** transactions with explainable ML — shows _why_, not just _what_.
- **Multi-tenant dashboard**: one firm manages all client books from a single workspace.
- **Real accounting**: full double-entry ledger with audit trail. Not transaction tagging — actual journal entries with debit/credit integrity.
- **Works where firms operate**: US banking via Plaid + Nigeria banking via Mono. Multi-geography from day one.
- **Every number is traceable**: from financial statement → journal entry → bank transaction → ML reasoning. Full provenance chain.

---

**Speaker notes:**
Four things make this different from everything else in the market. First, it's built for firms — multi-tenant, role-based, designed for the workflow of an accountant managing dozens of clients. Second, explainable AI — every categorization comes with confidence scores and reasoning, so the bookkeeper knows why the system made a decision. Third, real double-entry accounting — this isn't a transaction tagger that approximates books; it produces proper journal entries. Fourth, multi-geography banking — no other product connects to both US and Nigerian banks. These aren't roadmap items; they're built and running.

---

## SLIDE 5 — The Product

### Not mockups. Live product, built by one person in 3 months.

[SCREENSHOT 1: Categorization engine — showing ML confidence scores and explanations for transaction categorization]

[SCREENSHOT 2: Journal entry system — double-entry with debit/credit lines, account selection]

[SCREENSHOT 3: Multi-client workbench — company switcher / firm dashboard showing multiple client books]

[SCREENSHOT 4: Bank connection flow — Plaid/Mono integration onboarding]

---

**Speaker notes:**
This is the most important slide in the deck. At pre-seed, the #1 signal is a real product. These are live screenshots — not Figma mockups, not wireframes. The entire platform was built by a single founder in three months, from backend API to ML pipeline to production frontend. Point out the ML confidence scores on the categorization screen — this is what "explainable AI" looks like in practice. The journal entry system shows proper double-entry with constraint validation. The company switcher demonstrates the multi-tenant architecture. You will want to annotate each screenshot with a 1-line callout.

---

## SLIDE 6 — How It Works

### From bank feed to financial statements — with AI at every step

**Ingest** → Bank transactions flow in automatically via Plaid (US) or Mono (Nigeria)

**Classify** → Two-stage ML pipeline:

- Stage 1: Global intent classifier identifies the transaction type
- Stage 2: Tenant-specific ranker maps to the client's chart of accounts

**Review** → Bookkeeper reviews categorizations in a queue-based workbench. Every suggestion includes confidence scores and explanations.

**Post** → Validated entries go to an append-only double-entry ledger. Debits always equal credits. Full audit trail.

**Report** → Financial statements with drill-through to source evidence.

**The data flywheel**: Every bookkeeper correction improves the model. More firms = better AI for everyone.

---

**Speaker notes:**
Two technical differentiators to emphasize. First, the two-stage ML pipeline: most competitors use a single model. Our approach separates "what kind of transaction is this?" (global) from "which specific account should this hit for THIS client?" (tenant-specific). This means the system gets smarter per-client over time, not just globally. Second, the data flywheel: in a B2B2C model where one firm has 50+ clients, every correction from every bookkeeper feeds back into training data. This creates a compounding advantage — the more firms we onboard, the better the AI gets for all of them. At scale, this is the moat.

---

## SLIDE 7 — Business Model & Market

### B2B2C: sell to the firm, they serve the clients

|                    |                                                               |
| ------------------ | ------------------------------------------------------------- |
| **Model**          | Sell to accounting firms. They use it to serve their clients. |
| **Pricing**        | Per-client-per-month: **$30–100/client**                      |
| **Unit economics** | One firm = 30–300 clients → **$1K–$30K MRR per firm**         |
| **Expansion**      | Start with bookkeeping → add tax prep, payroll, advisory      |
| **Stickiness**     | Client data in the system = high switching costs              |

### Market

- **TAM**: $21.56B global accounting software (8.85% CAGR)
- **AI subsegment**: $10.87B → $68.75B by 2031 (**44.6% CAGR**)
- **Addressable firms**: 46,000 (US) + 25,000 (Nigeria) = **71,000+**
- **Year 1 target**: 50–100 pilot firms → **$500K–$2M ARR**

---

**Speaker notes:**
The B2B2C model is the unlock. Instead of acquiring individual SMBs one at a time (expensive, high churn), we sell to accounting firms — and each firm brings 30–300 clients. That's 30–300x better unit economics than SMB-direct. Stickiness is also structural: once a firm's client books live in the system, the cost of migrating is prohibitive. The pricing model ($30–100/client/month) is significantly below hiring additional bookkeepers ($3,000–5,000/month each), so the ROI case for firms is immediate. On market size: we use bottoms-up math. 71,000 firms across US and Nigeria, average 50 clients, at $50/client/month = $2.1B SAM. We need 0.07% to hit $1.5M ARR.

---

## SLIDE 8 — Competition

### $400M+ validates the market. Our quadrant is empty.

**2x2 Matrix:**

|               | **Built for SMBs**                                                           | **Built for Firms**                                    |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| **AI-Native** | Kick ($20M), Digits ($97M), Puzzle ($66M), Rillet ($100M+), Campfire ($103M) | **Accountable** ← we are here                          |
| **Legacy**    | QuickBooks (62% share), Xero                                                 | Karbon, TaxDome (workflow only — no accounting engine) |

### Key gaps in every competitor

- **Kick / Digits / Puzzle**: Target SMBs directly. No multi-client firm workflow.
- **Rillet / Campfire**: Enterprise ERP. $100K+ contracts. Not for mid-market firms.
- **Accrual** ($75M): Tax preparation only. No bookkeeping.
- **Karbon / TaxDome**: Practice management — CRM and task tracking. No actual accounting.
- **QuickBooks / Xero**: Legacy architecture. No AI-native categorization. Weak firm tools. No emerging markets.

**No one combines: AI-native + built for firms + multi-geography.**

---

**Speaker notes:**
This is the most important competitive slide you'll present. The 2x2 makes the positioning immediately clear: every AI-native competitor targets SMBs or enterprise, while everything built for firms is either legacy (QuickBooks/Xero) or workflow-only (Karbon/TaxDome). We occupy the empty quadrant. Importantly, the $400M+ raised by these companies is GOOD for us — it validates that AI accounting is a real, massive market. We're not arguing the market exists; we're arguing everyone is targeting the wrong buyer. When investors ask "what about Kick?", the answer is: Kick helps SMBs do their own books. We help the firm that manages 100 SMBs do all their books from one dashboard. Different buyer, different product, different go-to-market.

---

## SLIDE 9 — The Founder

### I couldn't find software that worked for my firm, or a developer who understood accounting. So I became both.

- **Chartered Accountant at 18** — one of the youngest in Africa
- **Dual-qualified**: Nigeria (ICAN) + United Kingdom
- **Masters in Economics** (Distinction)
- **~10 years** in professional accounting
- **Ran own multi-country practice**: clients across Nigeria, US, and UK. **$100K+ annual revenue.**
- **Tested 38+ accounting tools**. Expert-level in 11. Advisor-certified in 4.
- **Hired a developer** to build this product. They couldn't get double-entry ledger logic or GAAP compliance right.
- **Burned the boats**: shut down practice → moved to UK → completed software + AI engineering program → built the entire platform solo.
- **Result**: 150K+ lines of production code. 31 API domains. Two-stage ML pipeline. Multi-geography banking integrations. Production infrastructure on Fly.io, Neon, and Vercel.

---

**Speaker notes:**
By slide 9, the investor has seen the problem, the market, the product, and the competition. Now they learn WHO built all of this — and the story recontextualizes everything they just saw. This is not an engineer who read about accounting. This is a chartered accountant with a decade of experience who ran the exact type of firm this product serves, tested every competitor in the market, and when none of them worked — and when even the developer they hired couldn't get the accounting right — they learned to code and built it themselves. The velocity is the signal: from bootcamp to 150K+ LOC production system with AI/ML, banking integrations, and production infrastructure in roughly three months. Domain expertise is the moat in accounting software. This founder has it. The "developer couldn't get double-entry right" anecdote is powerful because it proves why accounting-domain founders have a structural advantage in this space.

---

## SLIDE 10 — Traction & Validation

### The product exists. The market is proven. The expertise is earned.

- **Product**: 80%+ of core MVP complete. Production infrastructure deployed and running.
- **Architecture**: 31 API domains, double-entry ledger with constraint validation, ML categorization pipeline, multi-tenant RBAC — production-grade, not prototype.
- **Banking integrations**: Live connections to Plaid (US) and Mono (Nigeria).
- **Domain validation**: Ran the exact type of firm this product serves. Served multi-country clients. Generated $100K+ ARR from accounting services.
- **Market tested**: Evaluated 38+ competing products at expert level. Built the product that none of them are.
- **Waitlist**: [Insert current waitlist numbers]
- **[If applicable]**: Letters of intent, pilot commitments, advisor endorsements, demo feedback quotes.

---

**Speaker notes:**
Pre-seed traction is about signals, not scale. The signals here are strong: (1) a substantially built product — not a pitch deck with no code behind it; (2) production infrastructure that's deployed and running; (3) a founder who operated in the exact market they're building for, with paying clients; (4) 38+ competitor evaluations that prove deep market understanding. If you have waitlist numbers, LOIs, or pilot commitments, add them here. Even 10 firms expressing interest is meaningful at pre-seed. If you've done any demos and have feedback quotes from accountants/firm owners, include 1-2 here — social proof from practitioners is gold.

---

## SLIDE 11 — The Ask

### $500K pre-seed → product-market fit in 12 months → seed-ready

**Raising $500K** via SAFE or convertible note

### Use of funds

| Allocation               | %   | What it buys                                         |
| ------------------------ | --- | ---------------------------------------------------- |
| Engineering (2 hires)    | 40% | ML engineer + full-stack developer — 9 months runway |
| Product & Infrastructure | 25% | Cloud hosting, banking API fees, ML compute          |
| Go-to-market             | 20% | Beta program, firm partnerships, content             |
| Operations               | 15% | Legal, compliance, buffer                            |

### Milestones — what $500K delivers

| Months | Milestone                  | Measurable outcome                                      |
| ------ | -------------------------- | ------------------------------------------------------- |
| 1–2    | MVP complete               | Dashboard + financial statements shipped                |
| 2–4    | Beta launch                | 10–20 firms onboarded (US + Nigeria)                    |
| 4–6    | Data flywheel spins        | 50K+ categorized transactions, ML model training begins |
| 6–9    | Product-market fit signals | 50+ active firms, NPS > 40, monthly churn < 5%          |
| 9–12   | Seed-ready                 | $50K+ MRR, ML accuracy > 85%, raise $2–3M seed          |

---

**Speaker notes:**
$500K is a disciplined ask — the median US pre-seed is $700K. This raise buys 12 months of focused execution with two key hires. The milestone table is designed to give investors confidence that their money maps to measurable outcomes. Walk through each row: months 1-2 are about completing the product (dashboards and financial statements — the last 20% of MVP). Months 2-4 are about getting real firms on the platform in both markets. Months 4-6 are about generating the training data that makes the ML model defensible. Months 6-9 are about proving product-market fit with retention metrics. And months 9-12 are about being in a position to raise a $2-3M seed with real revenue and a trained model. The 40% engineering allocation reflects the biggest need: the founder has built the product solo; now it's time to add firepower.

---

## SLIDE 12 — Close

### The opportunity

The product exists. The architecture is proven. The market is validated by $400M+ in competing raises.

Every funded competitor targets US SMBs or enterprise. No one is building AI-native bookkeeping for accounting firms. No one supports emerging markets.

One firm = dozens of clients. Multi-geography is the wedge.

**$500K → product-market fit in 12 months → seed-ready.**

**getaccountable.com**

[Your email] | [Your LinkedIn]

---

**Speaker notes:**
End with clarity and confidence. The close restates the three strongest points: (1) this isn't a pitch deck without a product — the platform is built and running; (2) the competitive landscape has a clear gap that $400M+ in funding has helped define; (3) the B2B2C model and multi-geography approach create a differentiated wedge. The call to action is simple: invest $500K now, get to seed-ready metrics in 12 months. Leave contact information and the website. If sending cold, include a 2-minute Loom demo link here — nothing converts better than seeing a real product in action.

---

---

# APPENDIX SLIDES

> Include these in a follow-up meeting or as backup slides. Do not include in the cold-send deck.

---

## APPENDIX A — The Ledger-First Vision

### Today: AI bookkeeping tool. Tomorrow: the operating system for accounting.

**The Ledger-First standard** reimagines how accounting works at a fundamental level:

- **Event-native**: Every financial event (invoice, payment, receipt) is captured as a structured, immutable event — not manually keyed.
- **Policies-as-code**: Accounting rules are versioned, testable, deterministic code — not tribal knowledge locked in spreadsheets.
- **Provenance graph**: Every number in every report traces back through: **financial statement → journal entry → policy rule → source event → bank transaction**. Full explainability by construction.
- **Continuous integrity**: Balance assertions, reconciliation checks, and anomaly flags run in real-time — not once a year during audit.
- **Network protocol**: Invoices, payments, and receipts become shared financial events between counterparties. No re-keying. No reconciliation gaps.

### The long arc

| Phase        | Focus                                           | Timeline     |
| ------------ | ----------------------------------------------- | ------------ |
| **Now**      | AI bookkeeping for firms (this raise)           | 0–12 months  |
| **Seed**     | Tax prep, payroll, advisory modules             | 12–24 months |
| **Series A** | Policies-as-code engine, continuous audit       | 24–36 months |
| **Beyond**   | Network protocol — inter-company event exchange | 36+ months   |

> "No blockchain, no global state, no tokens. Just deterministic accounting rules applied to verified financial events."

---

**Speaker notes:**
This is the "how does this become a billion-dollar company" slide. The Ledger-First standard is genuinely differentiated technical thinking — it's not "QuickBooks with AI bolted on." The vision is that accounting should be a deterministic pipeline: events come in from source systems, versioned policy rules process them, and the ledger is an append-only output with full provenance. Today's product (AI bookkeeping) is the wedge. But the platform becomes something much larger: an operating system where accounting rules are code, audit is continuous, and financial events flow between companies as structured data rather than PDFs and re-keyed entries. This is the kind of vision that justifies a 100x valuation trajectory. Use this in follow-up meetings when investors ask "what's the 10-year vision?"

---

## APPENDIX B — Go-to-Market Detail

### Phase 1: Founder-led sales (months 0–6)

- **Target**: Small accounting firms (5–50 clients) in US and Nigeria
- **Channel**: Direct outreach to firms the founder knows from 10 years in the industry
- **Offer**: Free beta access in exchange for feedback and case studies
- **Goal**: 10–20 firms, deep relationship, high-touch onboarding

### Phase 2: Community-led growth (months 6–12)

- **Content**: "AI Bookkeeping Benchmark" — publish real categorization accuracy data. No other company does this.
- **Partnerships**: Accounting professional associations (AICPA, ICAN)
- **Referral program**: Firm-to-firm referrals with credit incentives
- **Goal**: 50+ firms through organic and referral channels

### Phase 3: Scale (months 12–24, post-seed)

- **Hire**: GTM lead with accounting/fintech background
- **Expand**: Kenya, Ghana, South Africa — use Nigeria playbook
- **Channel**: Reseller partnerships with accounting software consultants
- **Goal**: 200+ firms, $100K+ MRR

### Why dual geography works

- **Nigeria**: 25,000+ accounting firms. Zero modern tooling. First-mover advantage is absolute.
- **US**: Validates for institutional investors. Larger ACV. Plaid ecosystem.
- **Shared platform**: Same codebase, same ML models, different banking integrations. Marginal cost of adding a geography is one banking API integration.

---

**Speaker notes:**
The dual-geography question will come up in every investor conversation. The answer is simple: it's not two products — it's one platform with pluggable banking integrations. The US validates for investors and provides higher ACV. Nigeria provides zero-competition first-mover advantage and a massive addressable market. Phase 1 is founder-led: the founder ran an accounting firm for a decade and has direct relationships with practitioners. Phase 2 leverages content marketing — publishing real ML accuracy benchmarks is a differentiator because no competitor shares their numbers. Phase 3 is where the seed raise enables geographic expansion across West Africa using the Nigeria playbook.

---

## APPENDIX C — Technical Architecture

### Stack overview

| Layer              | Technology                                   | Why                                       |
| ------------------ | -------------------------------------------- | ----------------------------------------- |
| **API**            | Express.js, Knex.js, PostgreSQL              | Proven stack, rapid iteration, strong ORM |
| **Web**            | React, TypeScript, Vite, Tailwind            | Modern SPA with type safety               |
| **ML Engine**      | Python, FastAPI, scikit-learn                | Industry-standard ML tooling              |
| **Banking**        | Plaid (US), Mono (Nigeria)                   | Market-leading aggregators per geography  |
| **Infrastructure** | Fly.io, Neon (PostgreSQL), Vercel, S3, Redis | Production-grade, cost-efficient          |
| **Job Processing** | BullMQ + Redis                               | Reliable async task processing            |

### ML pipeline — two-stage categorization

```
Bank Transaction
       │
       ▼
┌─────────────────┐
│ Stage 1: Global  │  TF-IDF + cosine similarity (→ LightGBM with real data)
│ Intent Classifier│  "What kind of transaction is this?"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Stage 2: Tenant  │  Heuristic + embeddings (→ LambdaRank with real data)
│ Account Ranker   │  "Which account in THIS client's chart of accounts?"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Confidence Score │  SHAP values + explanation
│ + Explanation    │  "Why did the model choose this?"
└────────┬────────┘
         │
         ▼
   Bookkeeper Review Queue
```

### Data model highlights

- **Append-only ledger**: Journal entries are immutable. Corrections are new entries, never overwrites.
- **Constraint solver**: Debits must equal credits — enforced at the database level.
- **Multi-tenant RBAC**: Admin, Manager, Bookkeeper, Viewer roles per firm.
- **Change logging**: Every mutation is logged with actor, timestamp, and before/after state.
- **31 API domains**: Companies, accounts, journals, transactions, categorization, banking, users, roles, reports, and more.

### Next-gen platform (a-one)

- Go (net/http) modular monolith with sqlc for type-safe database access
- OpenAPI as source of truth with codegen for TypeScript and Go
- Starting with Payroll as the first independent product module
- Designed to eventually replace the current Express.js backend

---

**Speaker notes:**
This slide is for technical investors or CTOs doing diligence. Two things to emphasize: (1) the architecture is production-grade, not prototype-quality — it has proper RBAC, audit logging, constraint validation, and async job processing; (2) the two-stage ML pipeline is intentionally designed to improve with data. Stage 1 ships with heuristics (TF-IDF + cosine similarity), but the architecture supports LightGBM once we have enough labeled data from real bookkeeper corrections. Stage 2 follows the same pattern: heuristics now, LambdaRank later. This "rules before models" approach is the responsible way to ship ML in accounting — you get useful automation on day one, and the models get better with every correction. The next-gen Go platform shows long-term technical ambition without over-engineering the current product.

---

## APPENDIX D — Product Roadmap

### Accounting Workbench v1 (current build)

The product roadmap is defined by a 1,400+ line product specification covering:

**Completed (80%+)**

- Transaction categorization with ML confidence scores
- Double-entry journal system with constraint validation
- Multi-tenant company management with RBAC
- Bank integrations (Plaid + Mono)
- Chart of accounts management
- Recurring journal templates
- Change logging and audit trail
- AI assist for categorization explanations

**Remaining for MVP (2–3 weeks)**

- Firm dashboard with client overview metrics
- Client dashboard with financial health summary
- Trial balance with drill-through
- Financial statements (P&L, Balance Sheet, Cash Flow)
- Period close workflow

### Post-MVP roadmap

| Quarter        | Feature                   | Impact                           |
| -------------- | ------------------------- | -------------------------------- |
| Q1 post-launch | Bulk categorization queue | 10x bookkeeper throughput        |
| Q2             | Tax preparation module    | New revenue stream for firms     |
| Q3             | Payroll integration       | Reduce firm tool count           |
| Q4             | Multi-currency support    | Unlock cross-border firms        |
| Year 2         | Policies-as-code engine   | Codify accounting rules          |
| Year 2         | Continuous audit checks   | Real-time integrity verification |
| Year 3         | Network protocol (beta)   | Inter-company financial events   |

---

**Speaker notes:**
The product spec depth is unusual for pre-seed. Most founders at this stage have a pitch deck and some mockups. This product has a 1,400-line specification with role-aware dashboards, state machines, wireframes, and a day-by-day build plan. The remaining MVP work (dashboards + financial statements) is well-defined and estimated at 2-3 weeks. Post-MVP, the roadmap expands from bookkeeping into adjacent services (tax, payroll, multi-currency) before moving into the deeper Ledger-First platform capabilities (policies-as-code, continuous audit, network protocol). Each feature either increases per-firm revenue or deepens the moat.

---

---

# DESIGN NOTES

> Guidance for whoever designs the slides.

### General

- **Color palette**: Professional, not flashy. Dark navy or charcoal primary, with one accent color (teal, green, or blue — signaling trust/finance).
- **Typography**: Clean sans-serif. One font family, two weights (regular + bold).
- **Layout**: Lots of white space. Max 5–6 bullet points per slide. No walls of text.
- **Charts/graphics**: The 2x2 competition matrix (Slide 8) and the ML pipeline diagram (Appendix C) should be visual, not text-based.

### Slide-specific

- **Slide 1**: Logo centered, tagline below, raise amount small at bottom. Clean and confident.
- **Slide 2**: Consider an icon or simple illustration per bullet point. The "headcount vs. intelligence" line could be a bold callout.
- **Slide 3**: Competitor logos with raise amounts make this visually impactful. Show the money flowing in.
- **Slide 5**: Full-bleed screenshots. Annotate with 1-line callouts. This slide should feel like a product page.
- **Slide 7**: Split layout — business model on left, market numbers on right.
- **Slide 8**: The 2x2 matrix should be a clean visual with logos. Accountable's position should be highlighted (different color, star, glow).
- **Slide 9**: Consider a professional photo of the founder. The quote at the bottom should be in a larger, distinct font.
- **Slide 11**: The milestone table should be the visual anchor. Use a timeline or roadmap graphic.
- **Slide 12**: Minimal. White space. Website and contact info. No clutter.

### For the cold-send version

- Export as PDF (not editable slides)
- File size under 10MB
- Include a Loom demo link on Slide 5 or Slide 12 if available
- File name: `Accountable_PreSeed_Deck_2026.pdf`
