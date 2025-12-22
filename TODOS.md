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
- Contact Type in Add new contact dialog

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
