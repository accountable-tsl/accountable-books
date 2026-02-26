## 🔧 EXISTING ISSUES TO FIX

### CRITICAL (Must Fix Before Launch)

- [x] Demo companies have null assigned firm ids
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
- [ ] Contact Type in Add new contact dialog
- [ ] Refactor getCategorizationTransactions to use cursor-based pagination instead of offset-based (like getJournalsByCursor). Current offset pagination can skip/duplicate rows if data changes between requests, especially problematic for infinite scroll in Cat Engine.

### NEAR-TERM (Post-Launch, High Impact)

- [ ] Recurring templates: in template view mode, add a “Generated journals” section (show latest N with date/status/reference, link to open journal, plus “View all” once we add an API filter by `recurring_template_id`).
- [ ] AI inline autocomplete (code-completion-style): ghost suggestion while typing (e.g. journal title/description/line description), accept with `Tab`, and telemetry for impressions/accepts/dismissals, latency, and cost.
- [ ] Company identity middleware migration: keep current `req.companyContext` rollout stable for now, then consolidate to `req.company.uuid/shortCode/identifier` across all company-scoped routes.
- [ ] Split transactions in autosave mode (Cat Engine)
- [ ] Advanced filters (Cat Engine)
- [ ] Bulk actions (Cat Engine)
- [ ] Trial balance (ensure accuracy + export)
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

### LATER (Future Versions / Nice-to-Have)

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
- [ ] Storage cleanup plan: delete orphaned uploaded blobs not referenced in DB after X hours/days (journals/ledger/bank). Consider also an on-discard cleanup endpoint for better UX.
- [ ] Tenant-scoped file dedupe: store checksum/hash, reuse same blob key for identical content within a company, and maintain many-to-many attachments.
- [ ] Once we're ready for lang and doc work, consider Google's oss langextract

---

Advisory locks, REGEX, Concurrency, Garbage Collection

GENERAL:
AI should be _infrastructure you don't see_. Results appear where you're already looking. Input happens from one consistent spot. The app itself is intelligent -- there's no "AI mode."
