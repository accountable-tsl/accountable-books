# 🚀 14-DAY LAUNCH PLAN

Launch `2025-29-09`

## 📅 WEEK 1: Core Transaction Flow

### Day 1: CSV Template & Upload Setup

- [x] Create standardized CSV template for bank transactions (similar to chart of accounts approach)
- [x] Write clear upload instructions in Google Sheets
- [x] Add template download link to upload UI
- [x] Test existing CSV upload flow with standardized format
- [x] Verify transactions save correctly to `bank_transactions` table

### Day 2: Plaid Transaction Sync

- [ ] Implement actual transaction fetching in `transaction-sync.worker.ts`
- [ ] Connect to Plaid API's `/transactions/get` endpoint
- [ ] Handle pagination and date ranges
- [ ] Store fetched transactions in database
- [ ] Add sync status tracking

### Day 3-4: Transaction Categorization UI (CatEngine) - Part 1

- [ ] Analyze database schema for transaction states (uncategorized, predicted, posted)
- [ ] Create database VIEW or query to unify transactions from multiple sources:
  - `bank_transactions` (uncategorized)
  - `predictions` table (predicted but needs review/below threshold)
  - `ledger_transactions`/`journal_entries` (already posted)
- [ ] Build transaction list component with unified data source
- [ ] Display: date, description, amount, account, current category, status
- [ ] Add basic filtering by status (uncategorized, predicted, posted)

### Day 5: Transaction Categorization UI (CatEngine) - Part 2

- [ ] Add category dropdown with chart of accounts integration
- [ ] Implement bulk categorization (select multiple transactions)
- [ ] Add "reviewed" status toggle and confidence scoring display
- [ ] Show categorization explanation/reasoning field
- [ ] Save category changes and update transaction status

### Day 6: Review Workflow & Auto-Post Logic

- [ ] Add "needs review" filter to transaction list
- [ ] Create review approval interface for predicted transactions
- [ ] Implement auto-post threshold logic (high confidence predictions)
- [ ] Add notes/explanation display for categorizations
- [ ] Implement "approve all" and "post to ledger" bulk actions
- [ ] Track who reviewed what and when (audit trail)

### Day 7: P&L Calculation Engine

- [ ] Create service to calculate P&L from transactions
- [ ] Group by income/expense categories
- [ ] Handle date range filtering
- [ ] Calculate totals and net profit/loss
- [ ] Add monthly/quarterly/annual views

## 📅 WEEK 2: Reports & Multi-tenancy

### Day 8: P&L Report UI

- [ ] Build P&L report component
- [ ] Display income, expenses, net profit sections
- [ ] Add date range selector
- [ ] Include drill-down to transaction details
- [ ] Export to PDF functionality

### Day 9: Balance Sheet Logic

- [ ] Calculate assets, liabilities, equity from chart of accounts
- [ ] Handle account balances as of specific dates
- [ ] Ensure accounting equation (Assets = Liabilities + Equity)
- [ ] Add comparative periods (previous month/year)

### Day 10: Balance Sheet UI & Export

- [ ] Build Balance Sheet report component
- [ ] Display assets, liabilities, equity sections
- [ ] Add PDF export functionality
- [ ] Include simple notes section for assumptions
- [ ] Add print-friendly styling

### Day 11: Minimal Dashboard

- [ ] Replace placeholder dashboard with real metrics
- [ ] Show: total income, expenses, net profit (current month)
- [ ] Display account balances summary
- [ ] Add recent transactions widget (last 10)
- [ ] Include simple income/expense trend chart

### Day 12: Client Invitation System

- [ ] Build email invitation system for accounting firms
- [ ] Create invitation email templates
- [ ] Add client signup flow from invitation links
- [ ] Handle firm-client relationship assignment
- [ ] Test subdomain routing for firms

### Day 13: Client Management UI

- [ ] Add client switcher component for accounting firms
- [ ] List all firm clients with basic info
- [ ] Implement client selection/switching
- [ ] Update navigation to show current client context
- [ ] Fix subdomain resolution issues

### Day 14: Staging Deployment & Testing

- [ ] Deploy complete system to staging environment
- [ ] Test complete user flow: signup → bank connection → transactions → reports
- [ ] Invite 3-5 accounting firms to test manually
- [ ] Document critical bugs and quick fixes
- [ ] Prepare production deployment checklist

## 🔧 EXISTING ISSUES TO FIX (During Sprint)

### CRITICAL (Must Fix)

- [x] Demo companies have null assigned firm ids
- [ ] URL resolves to null subdomain in frontend, should resolve to app
- [ ] Backup database for postgres
- [ ] Re-enable deployment protection (vercel) once we push to production
- [ ] Wire enqueueGLBalance into every ledger-entry mutation path so GL snapshots refresh automatically.
- FX Positions handling
- [x] UK Users (YE should be Apr 5) - Implemented automatic fiscal year-end defaults
- Make sure we are not allowing 30 Feb, 31 Sep etc on company signup
- CBN Exchange Rate up to date
- If I could destroy the fly staging app in one command, what stops another sinister dev from doing same. protect
- Contact model refactoring, frontend requests will break since I removed status from db and replaced with is_active... decide to either return contact_status or move to this new approach
- Once we are ready to launch, versioning is important. Stote, tag properly
- Default to modified cash basis on company creation. Also add default settings
- Consider removing input_checksum
- Make sure generate pydantic in contracts cleans up the /py folder first before generateing new stuff
-

### CAN DELAY (Post-Launch or future versions)

- [ ] Request company timezone at onboarding
- [ ] Individuals signing in from UK should have April 5 year end
- [x] Plaid Webhook implementation
- [ ] Implement monitoring - grafana, prometheus etc, and maybe versioning too
- [ ] Add concurrency to deploy-staging.yml : { group: staging, cancel-in-progress: true }
- [ ] Add all ISO 4217 currency codes to currencies table
- Handling opening balances upon ingesting/connecting user's bank accounts + Opening / Conversion Balances
- contact and contact type auto handling on insertion or cat of transactions
- Versioning account types
- Add tag field to companies and bank transaction tables. It should be an array of string. It'll be helpful to ml... for bank transactions, things like the categories provided by plaid can be added here which will make it useful for ml instead of being hidden in metadata that noone can access
- REVIEW CONSTRAINTS AND THEIR TEST e.g Projects check is not fully setup etc
- Strenghten exchange rate system and properly document exchange rate convention (e.g we always represent exchange rate in price/base and reporting currency is always the base)
- Detect transfers between own accounts
- Effect of an individual account marking an account as business; or vice versa; and how that affects accounting
- View raw bank transactions, delete batches
- Consider unifying timezone stuff. Just use UTC all through in the db... maybe even do this before launch
- Tracking user actions and trails across the app
- Consider: Improve categorization UI and make it more gamified and interactable with human language
- What if for personal finance, snapping and keeping receipts, people can get points
- Invoice to auto journals
- Auto generating depreciation journals etc
- Handling Monetary and FX Positions!!
- Caching of company settings
- is_trainable flag on ledger transactions
- Admin, metrics and support dashboards for admin, metrics and support stuff
- What's the limit of the infrastructure we launch on?
- Firm manager dashboard - total transactions categorized value and count, they can see per client, total time saved, %automatically handled, etc... helps them see value
- Client dashboard should also have something similar
- Collaborative mode for categorization... multiple bookkeepers can work on a client's book per time. Imagine as A is working on it, B can see where A is on the file. Like sheets but even more elegant and/or gamified
- Future feature... messaging and chat interactions: messaging clients directly, messaging other bookkeepers. Using chat to categorize or handle bulk actions
- Adding tags to transactions. BNot that creaat

---

**Success Criteria**: By Day 14, users can signup, connect banks, categorize transactions, and generate basic P&L and Balance Sheet reports.
