# AI Platform Plan (Web + API)

Status: proposed

This document turns our AI intentions into an implementation plan that:

- Preserves the current “dense accounting UI” strengths (screen space, speed, precision).
- Makes AI feel like the product (not a bolt-on assistant).
- Keeps AI safely optional (launch toggle + paid entitlement toggle).
- Makes every AI-driven change explainable, reviewable, and auditable.

This plan intentionally builds on existing foundations in this repo:

- Intent-based mutation patterns (categorization + ledger flows).
- Strong deterministic constraints (see `TXN_FLOW.md`, `docs/i.md`).
- Audit writing primitives (`apps/api/src/domains/audit/*`).
- Company settings registry (`apps/api/src/domains/settings/*`).

---

## 1) Product Principles (Non-Negotiables)

1. AI proposes; deterministic code decides.
   - AI outputs _proposals_ (structured data and/or intents).
   - Our services validate against accounting constraints and permissions.
   - Nothing “posts” silently unless an explicit setting allows it and we can prove safety.

2. AI should not create UI chrome debt.
   - Prefer inline, contextual affordances over persistent panels/docks.
   - Any “AI UI” must collapse to zero when disabled (no dead space).

3. Every AI action is reviewable and undoable.
   - Show a preview of changes (diff) before apply when mutations are non-trivial.
   - Provide a clean “what changed” trail at the entity level (transaction, journal, etc.).

4. History is per domain and per entity.
   - “Why did AI do this?” must be answerable inside the place the user is already working.

5. Paid feature enforcement is server-side.
   - Frontend gating is UX; backend gating is security and cost control.

---

## 2) What “AI Features” Means Here

We already have “AI” in the system (ML categorization with confidence + provenance). The missing layer is the _human interface to intelligence_:

- Natural language input that becomes structured accounting actions.
- Inline generation/cleanup (descriptions, memos, references).
- Explanations that cite internal evidence (prior transactions, rules, constraints).

These all fit Stage 19 in `docs/i.md` (LLM grounded explanations) and can also help earlier stages (e.g., richer normalization and entity resolution).

---

## 3) Feature Gating Model (Must Make Turning Off Easy)

We need 3 independent “switches”:

1. Global kill switch (ops):
   - API: `AI_ENABLED=false` disables _all_ AI endpoints and queues.
   - Web: `VITE_AI_ENABLED=false` hides AI affordances and prevents calls.

2. Entitlement (billing / plan):
   - Server must check `companyId`/`firmId` entitlement for every AI request.
   - Web uses entitlement only for display; never as enforcement.

3. Per-company configuration:
   - Use `company_settings` for granular controls (e.g. `ai_assist_enabled`, per-capability toggles).
   - Keep “autopost” settings separate from “assist” settings.

Implementation rule:

- If any switch says “off”, the system must behave like AI does not exist.
- Turning AI off must not break core flows.

---

## 4) Architecture Overview

### 4.1 Backend: AI Gateway + Capability Registry

Add a new API domain: `apps/api/src/domains/ai/*`.

Responsibility split:

- `domains/ai`: request validation, gating, provider selection, logging, and orchestration.
- Each existing domain (categorization, journals, reporting, etc.): defines its own AI “capabilities”.

Key concept: _Capabilities are typed_.

- A capability is a single “AI job” like:
  - `categorization.interpret_command` (text -> categorization intents)
  - `journal.from_text` (text -> draft journal)
  - `transaction.clean_description` (raw bank description -> clean description)
  - `reporting.explain_variance` (numbers -> grounded explanation)

Suggested capability shape (TypeScript):

```ts
type AiCapabilityId = string;

type AiCapability<I, O> = {
  id: AiCapabilityId;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  // Build server-side grounding context (COA, settings, prior examples, etc).
  buildContext: (ctx: { companyId: string; userId: string }) => Promise<any>;
  // Deterministic validation (constraints + permissions).
  validateProposal?: (
    proposal: O,
    ctx: { companyId: string; userId: string },
  ) => Promise<void>;
};
```

Execution model (safe-by-default):

1. `interpret` (LLM): input + grounded context -> proposal (structured)
2. `validate` (deterministic): constraints, permissions, invariants
3. `apply` (deterministic): _only after user confirmation_

This avoids giving the LLM “direct write” access to the database.

### 4.2 Backend: Endpoints (Minimal Set)

Start with two endpoints:

- `POST /api/ai/propose`
  - Inputs: `capabilityId`, `companyId`, `payload`
  - Outputs: `proposal`, `explanation`, `preview` (optional), `proposalId`

- `POST /api/ai/apply`
  - Inputs: `proposalId`, `companyId`, `confirm=true`
  - Outputs: `result` (created/updated ids), `undo` metadata if available

Notes:

- `proposalId` enables idempotency, review, and history.
- Most “inline generation” can skip `apply` and just return text to paste; but still log the run.

### 4.3 Backend: Providers and Model Choice

Implement an internal provider interface under `apps/api/src/integrations/llm/*`:

- `createCompletion(...)` / `createStructuredOutput(...)`
- Supports swapping providers (OpenAI, Anthropic, Azure, local, etc.)
- Enforces:
  - token limits
  - timeouts
  - JSON schema output
  - logging metadata

Keep provider keys isolated to the API environment (`apps/api/config/env-schema.ts`).

### 4.4 Backend: Logging + Audit (Provenance)

We need two layers of history:

1. Compliance-grade audit events (existing system):
   - Extend `auditEventEntityType` beyond `bank_transaction`/`journal` as needed.
   - New audit actions:
     - `ai.proposal_created`
     - `ai.proposal_applied`
     - `ai.proposal_rejected`

2. AI run details (debug/cost/trace):
   - Option A: dedicated `ai_runs` + `ai_proposals` tables.
   - Option B (smaller): store run metadata inside audit payloads.

Recommendation:

- Use audit events for “what happened”.
- Use `ai_runs` for “how it happened” (tokens, model, latency, prompt hash, tool traces).

### 4.5 Frontend: AI Runtime Provider + Store

We need an app-level AI runtime that centralizes:

- `aiEnabled` (derived from env + entitlement + company setting)
- current AI “scope” (route + selected entity ids)
- client-side history cache and last actions (optional)

State choice:

- Zustand store for state (stable subscriptions, avoids rerender storms).
- React Context is optional in this app. If we use it, it should only provide a stable “AI runtime API” and/or the store instance (testing/injection), not hold fast-changing state.

Placement (consistent with `docs/architecture/frontend-structure.md`):

- Provider wiring: `apps/web/src/app/*`
- Cross-domain AI primitives (client, hooks, types): `apps/web/src/shared/*`
- Reusable AI UI components: `apps/web/src/components/ai/*`
- Global AI UI surfaces (launcher, command bar overlay): `apps/web/src/app/*` or `apps/web/src/layouts/*`

### 4.6 Frontend: Capability Registration

Not every AI touchpoint needs registration.

Use registration for:

- a “single smart input” component that routes commands by context
- keyboard shortcuts and discoverability
- consistent history views

Pattern:

- Each domain exports `registerAiCapabilities(registry)` (no side effects).
- App calls these once during bootstrap (or per-route lazy import).

### 4.7 Frontend: Component Kit (Small, Reusable Primitives)

Start with 4 primitives; avoid building a “mini design system”:

1. `AiActionButton`
   - icon + tooltip, disabled state when AI off, consistent loading.

2. `AiProposalPreview`
   - compact summary (“Will update Account: Rent Expense”) + “View details”.

3. `AiDiffDialog`
   - show structured diff for multi-field changes; supports “Apply”.

4. `AiHistoryDialog` / `AiHistoryPopover`
   - per entity timeline (proposals, applies, rejects) with “why” expansion.

UI rule:

- No persistent dock/panel by default.
- Use existing “detail surfaces” (transaction view, journal drawer, etc.) as the home for explanations/history.

### 4.8 Frontend: Global UI Shape (Recommended)

Default: a “command bar” that takes **zero** space until invoked.

- Trigger: keyboard shortcut (e.g. `Cmd`+`/`) and a small icon in the header (optional).
- Location: floating overlay anchored to bottom-center (or top-center), so it never competes with dense tables when closed.
- Behavior: single-line input that grows up to ~3 lines while typing; submit produces a compact preview/diff; user explicitly applies.
- Escape hatch: a “pin” action that turns the overlay into an optional side panel for users who want a longer chat-like thread.

This matches the patterns in `/Users/temi/codebase/aij` (collapsed → expand compose bar + subtle AI-filled-field highlights) while avoiding the always-visible assistant footprint seen in many products.

---

## 5) First Capabilities (High Impact, Low Chrome)

Start where the product already has strong infrastructure: Cat Engine.

### 5.1 Cat Engine: Natural Language -> Intents

Capability: `categorization.interpret_command`

Input:

- `bankTransactionId`
- `selectedEntryIds` (optional)
- `text` (e.g. “split 5000 rent, 200 utilities”; “mark as meals”; “set vendor to Amazon”)

Output proposal:

- A typed list of categorization intents (aligned with `@accountable-books/contracts/schema` intents where possible).
- A short explanation per intent (“matched COA label ‘Rent Expense’ with 0.92 confidence based on prior matches…”).

Apply:

- Feed proposed intents into the existing intent pipeline (same as manual edits).
- Show a preview if multiple entries/fields are changed.

Why this is the right first step:

- Delivers “type instead of click” without adding new screens.
- Uses existing constraint validation and ledger intent infrastructure.
- Keeps UI dense: a single input, invoked when needed.

### 5.2 Transaction Description Cleanup

Capability: `transaction.clean_description`

- Converts raw bank narratives into clear accountant-grade descriptions.
- Lives as a small wand icon next to existing description fields.
- Always “preview then apply” (replace-in-field).

### 5.3 Rule Creation From Plain English (Optional Next)

Capability: `categorization.create_rule_from_text`

- “Always categorize Starbucks as Meals”
- Outputs a rule draft + test preview on recent transactions.
- Apply creates a deterministic rule (rules beat models).

---

## 6) Roadmap (Phased, Shippable Increments)

### Phase 0: Foundation (1–2 weeks)

- Add env flags: `AI_ENABLED` (API) and `VITE_AI_ENABLED` (Web).
- Create `domains/ai` skeleton with gating + provider interface.
- Add audit actions for AI proposal/apply/reject.
- Implement minimal `AiRuntimeProvider` in web (enabled state only).

Exit criteria:

- Turning AI off removes UI affordances and disables endpoints.
- AI endpoints work in dev with a stub provider.

### Phase 1: Cat Engine Command (2–4 weeks)

- Implement `categorization.interpret_command` (proposal + apply).
- Add `AiActionButton` + `AiDiffDialog` + inline command input inside Cat Engine toolbar (collapsed by default).
- Persist proposal + apply results to audit/history.

Exit criteria:

- User can type 5–10 common commands and reliably see/apply the results.
- Every apply is auditable and reviewable on the transaction.

### Phase 2: Cross-Domain History + Explainability (2–3 weeks)

- Add `GET /api/audit/events` read endpoint (scoped by entity).
- Add `AiHistoryDialog` embedded in transaction/journal detail views.
- Add “Why?” surfaces that show evidence and the deterministic validation result.

Exit criteria:

- Users can answer “what did AI do?” and “why?” per entity without leaving the workflow.

### Phase 3: Natural Language Journal Drafting (future)

- Capability: `journal.from_text` (draft, not post).
- UI: quick-create popup that produces a balanced draft journal with editable lines.
- Apply creates a journal draft; posting remains deterministic and explicit.

### Phase 4: Reporting Explanations (future)

- Capability: `reporting.explain` (read-only, grounded).
- Must cite internal sources only (ledger lines, period settings).

---

## 7) Safety, Privacy, and Cost Controls

Minimum controls before production:

- Server-side rate limiting per company/user.
- Token/cost budget per company/day with hard caps.
- Data minimization and redaction where possible.
- “No training / no retention” provider settings where supported.
- Prompt hashing + structured output schemas (avoid raw prompt logging).

---

## 8) Open Decisions (Answer These Early)

1. Which LLM provider(s) do we support first?
2. Do we want streaming responses in UI, or do we keep AI “batchy” (recommended for accounting edits)?
3. Where does entitlement live (company_settings vs billing tables)?
4. What is the default retention for AI run logs?
5. Which entities must have AI history at v1 (bank transactions + journals are the obvious starting point)?

<!-- More thoughts -->

In a high-volume bookkeeping system for multiple clients, AI agents transition the software from a "data repository" to an "autonomous workforce." For a firm, this means shifting from doing the bookkeeping to reviewing it.
Here are the specific areas where a multi-agent architecture is most useful in your use case:

1. The "Categorization & Journaling" Agent
   Instead of a simple rules-based engine (e.g., "If 'Shell', then 'Fuel'"), an agent uses semantic reasoning to handle messy bank data.
   Contextual Logic: It can distinguish that a $45 charge at a "Walgreens" for a law firm is likely "Office Supplies," but for a medical client, it might be "Clinic Supplies".
   Complex Journaling: It doesn't just pick a category; it can draft multi-line journal entries, such as splitting a loan payment into principal and interest based on an uploaded amortization schedule.
2. The "Evidence Collector" Agent
   This agent acts as a digital clerk that proactively hunts for missing documentation.
   Automated Matching: It scans email inboxes or portals to find invoices that match bank transactions.
   Gap Identification: At the end of the week, it identifies which transactions have no "evidence" and prepares a summarized list for the client.
3. The "Client Communicator" Agent
   This is where the "black box" is most effectively bypassed. Instead of you emailing clients manually, an agent handles the "Unclear Transactions" queue.
   Intelligent Querying: It sends a message: "I see a $1,200 charge to 'Apple' on June 5th. Was this a new laptop (Asset) or a repair (Expense)?".
   Sentiment Awareness: It can escalate to a human if the client’s response seems frustrated or if the transaction is significantly over a certain dollar threshold.
4. The "Financial Auditor" Agent
   Before you finalize statements, this agent runs a "sanity check" across all clients.
   Anomaly Detection: It flags if a client’s "Marketing Spend" is 300% higher than their historical average or if a recurring utility bill was missed this month.
   Narrative Generation: It drafts the Management Notes for the financial statements, explaining why cash flow dipped or why margins improved, so the accountant doesn't start from a blank page.
   Strategic Advantage for Firms
   For a firm managing multiple clients, these agents allow you to scale without a 1:1 increase in headcount.
   Reduced "Cost to Serve": Agents handle the low-value manual work, allowing you to offer fixed-fee pricing while maintaining high margins.
   Continuous Bookkeeping: Instead of a "month-end crunch," the agents work 24/7, meaning books are essentially "closed" every day.

An AI-native app shouldn't require the user to "log in" to be productive.

- The agent should live where the user lives. We should build "wrappers" for the agent on WhatsApp, Slack, and Email.
- Real-world feel: A firm owner can voice-note their "Clerk Agent" on WhatsApp: "Just had lunch with a client, $85 at Smith's Steakhouse, use the Marketing budget." The agent responds: "Got it. I've drafted that journal entry for your review in the dashboard."
- Semantic search as navigation

\*\* Automated "Anomaly & Insight" Engine
Most SaaS apps are passive. An AI-native app is proactive.
The Auditor Agent: Every night, an agent runs "Simulated Audits" across all client books.
The Experience: When the accountant logs in Monday morning, the "Home" screen says: "I noticed Client A's payroll tax is 15% higher than last month, and Client B has a subscription they haven't used in 90 days. Should I ask them if they want to cancel?"
