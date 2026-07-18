## 🔧 EXISTING ISSUES TO FIX

### CRITICAL (Must Fix Before Launch)

- [ ] In CI/CD, we should make sure every DB extension required is available, app schema is used, and related stuff
- [ ] Noone should be able to mistakenly access the staging environment mistakenly
- [ ] Make sure noone can access or make a request to a company they do not have access to (special case for support and admin)
- [ ] URL resolves to null subdomain in frontend, should resolve to app
- [ ] Backup database for postgres
- [ ] Re-enable deployment protection (vercel) once we push to production
- [ ] Wire enqueueGLBalance into every ledger-entry mutation path so GL snapshots refresh automatically.
- [ ] Journals attachments end-to-end correctness: align `JournalBatchInput.files` contract with API expectations, upload via presigned URL, persist+attach on journal save, and view via signed download URL (no fabricated public URLs).
- [ ] FX Positions handling
- [x] UK Users (YE should be Apr 5) - Implemented automatic fiscal year-end defaults
- [ ] Make sure we are not allowing 30 Feb, 31 Sep etc on company signup
- [ ] CBN Exchange Rate up to date
- [ ] Protect fly staging app from accidental destroy
- [ ] Contact model refactoring: decide on contact_status vs is_active
- [ ] Once we are ready to launch, versioning is important. Store/tag properly
- [ ] Default to modified cash basis on company creation. Also add default settings
- [ ] Consider removing input_checksum
- [ ] Make sure generate pydantic in contracts cleans up the /py folder first before generating new stuff
- [ ] Rate limiting
- [ ] Contact Type in Add new contact dialog
- [ ] Refactor getCategorizationTransactions to use cursor-based pagination instead of offset-based (like getJournalsByCursor). Current offset pagination can skip/duplicate rows if data changes between requests, especially problematic for infinite scroll in Cat Engine.
- [ ] Privacy Policy, Terms of Use, GDPR,
- [ ] We should (for now) verify firms manually before they are allowed to add clients
- [ ] Should Cash basis companies need musthaveaccounts?
- [ ] Client invite/self-serve onboarding must ask whether the client needs historical catch-up bookkeeping.

### NEAR-TERM (Post-Launch, High Impact)

- [ ] Bank accounts UI: surface API `syncHealth` so reconnect needed (`action_required`) is distinct from data delayed (`delayed`/`pending`), instead of only showing “Last updated … ago”.
- [ ] Design and validate a product-owned headless table module after launch. Learn from TanStack Table, Tabulator, AG Grid, and other strong grids, but define the interface from our actual requirements: semantic table and div/grid renderers, virtualization, stable row identity, variable density, selection/expansion, keyboard navigation, accessible focus, inline editing with durable drafts, server filtering/sorting/pagination, infinite loading, pinned columns, and explicit performance budgets. Prototype the hardest Cat Engine workflow and one conventional table before committing to a full migration; keep rendering, remote data access, and accounting-specific behaviour behind separate seams.
- [ ] Recurring templates: in template view mode, add a “Generated journals” section (show latest N with date/status/reference, link to open journal, plus “View all” once we add an API filter by `recurring_template_id`).
- [ ] AI inline autocomplete (code-completion-style): ghost suggestion while typing (e.g. journal title/description/line description), accept with `Tab`, and telemetry for impressions/accepts/dismissals, latency, and cost.
- [ ] Company identity middleware migration: keep current `req.companyContext` rollout stable for now, then consolidate to `req.company.uuid/shortCode/identifier` across all company-scoped routes.
- [ ] Split transactions in autosave mode (Cat Engine)
- [ ] Advanced filters (Cat Engine)
- [ ] Bulk actions (Cat Engine)
- [ ] Trial balance (ensure accuracy + export)
- [ ] Accountant-grade exports: XLSX trial balance/GL in V1 where feasible, later formula-linked workbook and Google Sheets export with TB, GL, journals, P&L, balance sheet, notes, mappings, and traceability.
- [ ] P&L (v1)
- [ ] Balance sheet (v1)
- [ ] Client invite flow
- [ ] Client dashboard (v1)
- [ ] Firm dashboard (v1)
- [ ] Implement monitoring (Grafana/Prometheus) and versioning
- [ ] Request company timezone at onboarding
- [ ] Individuals signing in from UK should have April 5 year end
- [ ] Detect transfers between own accounts
- [ ] Handling opening balances upon ingesting/connecting user's bank accounts + Opening / Conversion Balances
- [ ] Strenghten exchange rate system and properly document exchange rate convention
- [ ] Handling Monetary and FX Positions!!
- [ ] View raw bank transactions, delete batches
- [ ] Tracking user actions and trails across the app
- [ ] Add all ISO 4217 currency codes to currencies table
- [ ] Add concurrency to deploy-staging.yml: { group: staging, cancel-in-progress: true }
- [ ] When implementing payments, do not do stripe only. Make sure to have a fallback ready by default
- [ ] Make sure we are not allowing users to add heavy files and where relevant necessary, don't load large or many files into memory
- [ ] Agent that connects to the company's Slack or email to auto-generate journals from invoices, bills, etc., and add them here as drafts. Especially helpful for companies using accrual accounting.
- [ ] AI Gateways with Reversible PII Redaction, Zero-Trust Access Controls for RAG
- [ ] Address (Google maps integration)

### LATER (Future Versions / Nice-to-Have)

- [ ] If the internal table module proves reliable across the Cat Engine and multiple conventional tables, evaluate extracting and publishing its generic core as an open-source package. Treat documentation, accessibility guarantees, browser support, semantic versioning, framework adapters, examples, benchmarks, and long-term maintenance as explicit release requirements; do not expose Accountable-specific data or workflow concepts in the public interface.
- [ ] Notification to deactivate account if not used after 45 days of sign up
- [ ] Consider unifying timezone stuff (UTC everywhere)
- [ ] REVIEW CONSTRAINTS AND THEIR TEST e.g Projects check is not fully setup etc
- [ ] Versioning account types
- [ ] contact and contact type auto handling on insertion or cat of transactions
- [ ] Add tag field to companies and bank transaction tables (array of strings)
- [ ] Caching of company settings
- [ ] is_trainable flag on ledger transactions
- [ ] What's the limit of the infrastructure we launch on?
- [ ] Admin, metrics and support dashboards for admin, metrics and support stuff
- [ ] Firm manager dashboard (expanded metrics/time saved)
- [ ] Client dashboard enhancements
- [ ] Consider: Improve categorization UI and make it more gamified and interactable with human language
- [ ] Consider refactoring Cat Engine intent manager to a Zustand store for more stable subscriptions and fewer re-renders
- [ ] Consider adding a custom scrollbar (or table-only scrollbar) to cap thumb size for aesthetics
- [ ] Collaborative mode for categorization (multi-bookkeeper)
- [ ] Future feature: messaging and chat interactions
- [ ] Invoice to auto journals
- [ ] Auto generating depreciation journals etc
- [ ] What if for personal finance, snapping and keeping receipts, people can get points
- [ ] Consider adding chromatic or an alternative
- [x] Plaid Webhook implementation
- [ ] **Banking frontend (backend done, contract-typed):** wire the `historicalImport` block from `GET /bank-accounts` into (1) a "N older transactions available from {date}" banner with an earlier-date picker calling `POST /bank-accounts/:id/history-import/select`; (2) review surfaces for `bank.transaction_superseded_review` + `bank.transaction_removed_review` notifications and `providerRemovedReviewCount`; (3) real sync/history status on the connection success step (replace "syncing shortly"). Add the "choose before {expiresAt}" deadline once expiry ships.
- [ ] Storage cleanup plan: delete orphaned uploaded blobs not referenced in DB after X hours/days (journals/ledger/bank). Consider also an on-discard cleanup endpoint for better UX.
- [ ] Tenant-scoped file dedupe: store checksum/hash, reuse same blob key for identical content within a company, and maintain many-to-many attachments.
- [ ] Once we're ready for lang and doc work, consider Google's oss langextract

### Firm clients — invite wizard & acquisition channels

- [ ] **Bulk add:** CSV import of clients — validate rows against the same invite/company rules (or a batch DTO derived from contracts), return per-row errors; design `POST …/invite` for single vs batch up front.
- [ ] **AI chat (v1):** add **one** client via firm chat — produce the same payload shape as manual invite (`FirmClientInviteRequest`), e.g. structured extraction + confirm or wizard handoff with prefilled fields.
- [ ] Share one validation/parsing path for UI, CSV, and chat so nothing drifts from `firmClientInviteRequestSchema`.

---

Advisory locks, REGEX, Concurrency, Garbage Collection

GENERAL:
AI should be _infrastructure you don't see_. Results appear where you're already looking. Input happens from one consistent spot. The app itself is intelligent -- there's no "AI mode."
