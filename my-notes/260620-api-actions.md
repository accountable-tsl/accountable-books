# API Actions Inventory

_Generated 2026-06-20. Every entry cites the source file. Implemented only — no TODOs or commented-out code._

---

## Global Auth Context

All routes under `/api` (after line 187 in `app.ts`) require `verifyAccessToken` (JWT from HTTP-only cookie). Routes mounted _before_ that line are public or use alternative auth.

Most company-scoped routes additionally apply `checkCompanyId` middleware (validates the authenticated user has access to `:companyId`).

CSRF protection is applied globally via `conditionalCsrf` (line 166, `app.ts`).

---

## Public Routes (no JWT required)

```
POST /auth/login
  Resource: User session
  Action: Authenticate user, issue JWT + refresh token
  Auth: authLimiter (rate limiting only)
  Handler: features/auth/auth.controller.ts — loginController

POST /auth/verify-email
  Resource: User
  Action: Verify email address via one-time token
  Auth: none
  Handler: features/auth/auth.controller.ts — verifyEmailController

GET /auth/csrf-token
  Resource: CSRF token
  Action: Issue CSRF token
  Auth: csrfProtection
  Handler: features/auth/auth.routes.ts:29 (inline)

POST /api/signup
  Resource: User + Company
  Action: Create new user account and workspace
  Auth: authLimiter
  Handler: features/signup/signup.controller.ts — clientSignup

GET /api/currencies
  Resource: Currency
  Action: List all currencies
  Auth: none
  Handler: domains/currencies/currencies.controller.ts — allCurrencies

GET /api/countries
  Resource: Country
  Action: List all countries
  Auth: none
  Handler: domains/countries/countries.controller.ts — getCountryList

POST /api/email/check
  Resource: Email
  Action: Validate email address
  Auth: none
  Handler: domains/email/email.controller.ts — checkEmailController

GET /api/accounting-firms/check-slug
  Resource: Firm
  Action: Check slug availability
  Auth: none
  Handler: domains/accountingFirms/firms.controller.ts — checkSlugController

GET /api/accounts/classification/metadata
  Resource: Account type metadata
  Action: Get classification metadata
  Auth: none
  Handler: domains/account/account.controller.ts — accountMetaController

POST /webhooks/banking/plaid
  Resource: Bank transactions
  Action: Receive Plaid webhook notifications
  Auth: optional Plaid signature verification (no JWT)
  Handler: domains/banking/webhooks/plaid.webhook.ts:34-131
  Note: Handles TRANSACTIONS and ITEM webhook types
```

---

## Session/Refresh Token Routes

```
POST /auth/refresh
  Resource: User session
  Action: Refresh access token using refresh token
  Auth: verifyRefreshToken
  Handler: features/auth/auth.controller.ts — refreshTokenController

GET /auth/me
  Resource: User
  Action: Get current user profile + CSRF token
  Auth: verifySessionToken, csrfProtection
  Handler: features/auth/auth.controller.ts — meController

POST /auth/logout
  Resource: User session
  Action: Revoke refresh token, clear cookies
  Auth: verifySessionToken
  Handler: features/auth/auth.controller.ts — logoutController

POST /auth/resend-verification
  Resource: User
  Action: Resend verification email
  Auth: verifySessionToken
  Handler: features/auth/auth.controller.ts — resendVerEmailController
```

---

## Authenticated Routes (verifyAccessToken required)

### Onboarding

```
POST /api/onboarding/advance
  Resource: Onboarding state
  Action: Advance onboarding step
  Auth: verifyAccessToken (via verifyRefreshToken on this specific route)
  Handler: features/onboarding/onboarding.controller.ts — updateOnboardingStatusController
```

### Companies

```
POST /api/companies/switch
  Resource: User session
  Action: Switch active company context
  Auth: verifyAccessToken
  Handler: domains/companies/companies.controller.ts — switchCompanyController

GET /api/companies/:companyId
  Resource: Company
  Action: Get company details
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/companies/companies.controller.ts — getCompanyController

PATCH /api/companies/:companyId
  Resource: Company
  Action: Update company settings/details
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/companies/companies.controller.ts — updateCompanyController
```

### Accounting Firms

```
GET /api/accounting-firms/:companyId/slug
  Resource: Firm
  Action: Get firm slug for company
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/accountingFirms/firms.controller.ts — getCompanySlugController

GET /api/accounting-firms/:companyId/slugs/check
  Resource: Firm
  Action: Check slug availability for company
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/accountingFirms/firms.controller.ts — checkSlugForCompanyController
```

### Users

```
GET /api/users/:id
  Resource: User
  Action: Get user details
  Auth: verifyAccessToken
  Handler: domains/users/users.controller.ts — getUserDetailsController
```

### User Roles

```
POST /api/:companyId/grant-access
  Resource: User role
  Action: Grant company access to user
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/user-roles/user-roles.controller.ts — grantAccessToCompanyController
```

### Billing

```
GET /api/billing/catalog
  Resource: Billing catalog
  Action: Get billing plan catalog
  Auth: verifyAccessToken
  Handler: domains/billing/catalog.controller.ts — getCatalog
```

### Chart of Accounts

```
GET /api/:companyId/coa
  Resource: Chart of accounts
  Action: List accounts
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/chart-of-accounts/coa.controller.ts — getCoaController

POST /api/:companyId/coa
  Resource: Chart of accounts
  Action: Create account
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/chart-of-accounts/coa.controller.ts — createCoaController

PATCH /api/:companyId/coa/edit
  Resource: Chart of accounts
  Action: Edit account
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/chart-of-accounts/coa.controller.ts — editCoaController

PATCH /api/:companyId/coa/archive
  Resource: Chart of accounts
  Action: Archive account
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/chart-of-accounts/coa.controller.ts — archiveCoaController

PATCH /api/:companyId/coa/unarchive
  Resource: Chart of accounts
  Action: Unarchive account
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/chart-of-accounts/coa.controller.ts — unarchiveCoaController

POST /api/:companyId/coa/lifecycle/preflight
  Resource: Chart of accounts
  Action: Check lifecycle operation feasibility (impact analysis)
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/chart-of-accounts/coa.controller.ts — preflightCoaLifecycleController

POST /api/:companyId/coa/lifecycle/execute
  Resource: Chart of accounts
  Action: Execute lifecycle operation (archive/delete with resolution)
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/chart-of-accounts/coa.controller.ts — executeCoaLifecycleController

DELETE /api/:companyId/coa
  Resource: Chart of accounts
  Action: Delete account
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/chart-of-accounts/coa.controller.ts — deleteCoaController
```

### Journals

```
POST /api/:companyId/journals/query
  Resource: Journal
  Action: Query journals (paginated)
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — getJournalsByPageController

POST /api/:companyId/journals/query/cursor
  Resource: Journal
  Action: Query journals (cursor-based)
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — getJournalsByCursorController

POST /api/:companyId/journals/import/preflight
  Resource: Journal
  Action: Validate import file before importing
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — importJournalsPreflightController

POST /api/:companyId/journals/import
  Resource: Journal
  Action: Import journals from file
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — importJournalsController

POST /api/:companyId/journals
  Resource: Journal
  Action: Create journal batch
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — postJournalController

PATCH /api/:companyId/journals/batch/post
  Resource: Journal
  Action: Batch post draft journals
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — postDraftJournalsBatchController

PATCH /api/:companyId/journals/batch/void
  Resource: Journal
  Action: Batch void journals
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — voidDraftJournalsBatchController

PUT /api/:companyId/journals/:journalId
  Resource: Journal
  Action: Update draft journal
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — updateDraftJournalController

PATCH /api/:companyId/journals/:journalId/post
  Resource: Journal
  Action: Post draft journal to ledger
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — postDraftJournalController

PATCH /api/:companyId/journals/:journalId/void
  Resource: Journal
  Action: Void journal
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — voidDraftJournalController

PATCH /api/:companyId/journals/:journalId/reverse
  Resource: Journal
  Action: Reverse posted journal
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — reverseJournalController

POST /api/:companyId/journals/:journalId/copy
  Resource: Journal
  Action: Copy journal
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — copyJournalController

GET /api/:companyId/journals/period-status
  Resource: Period status
  Action: Get fiscal period status for journals view
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/period-status.controller.ts — getPeriodStatusController

GET /api/:companyId/journals/:journalId
  Resource: Journal
  Action: Get journal details
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/journals.controller.ts — getJournalController
```

### Recurring Journal Templates

```
GET /api/:companyId/journals/templates
  Resource: Recurring template
  Action: List recurring templates
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/recurring-templates.controller.ts — listRecurringTemplatesController

POST /api/:companyId/journals/templates
  Resource: Recurring template
  Action: Create recurring template
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/recurring-templates.controller.ts — createRecurringTemplateController

POST /api/:companyId/journals/templates/preview
  Resource: Recurring template
  Action: Preview template execution
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/recurring-templates.controller.ts — previewRecurringTemplateController

PATCH /api/:companyId/journals/templates/:templateId/status
  Resource: Recurring template
  Action: Update template status (active/paused)
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/recurring-templates.controller.ts — updateRecurringTemplateStatusController

POST /api/:companyId/journals/templates/:templateId/run
  Resource: Recurring template
  Action: Manually run template now
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/recurring-templates.controller.ts — runRecurringTemplateNowController

GET /api/:companyId/journals/templates/:templateId
  Resource: Recurring template
  Action: Get template details
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/recurring-templates.controller.ts — getRecurringTemplateController

PUT /api/:companyId/journals/templates/:templateId
  Resource: Recurring template
  Action: Update template
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/recurring-templates.controller.ts — updateRecurringTemplateController

DELETE /api/:companyId/journals/templates/:templateId
  Resource: Recurring template
  Action: Delete template
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/journals/recurring-templates.controller.ts — deleteRecurringTemplateController
```

### Ledgers

```
PUT /api/:companyId/ledgers
  Resource: Ledger transaction
  Action: Create or update ledger transaction
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/ledgers/ledgers.controller.ts — updateOrCreateLedgerController

PATCH /api/:companyId/ledgers
  Resource: Ledger transaction
  Action: Create or update ledger transaction (alias)
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/ledgers/ledgers.controller.ts — updateOrCreateLedgerController
```

### Balances

```
GET /api/:companyId/balances/trial-balance
  Resource: Trial balance
  Action: Get trial balance
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/balances/balances.controller.ts — getTrialBalanceController

POST /api/:companyId/balances/trial-balance/refresh
  Resource: Trial balance
  Action: Trigger trial balance refresh
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/balances/balances.controller.ts — refreshTrialBalanceController
```

### Banking

```
POST /api/banking/link-token
  Resource: Banking
  Action: Create Plaid link token for bank connection
  Auth: verifyAccessToken
  Handler: domains/banking/banking.controller.ts — BankingController.createLinkToken

POST /api/banking/connect-accounts
  Resource: Bank account
  Action: Connect bank accounts via Plaid
  Auth: verifyAccessToken
  Handler: domains/banking/banking.controller.ts — BankingController.connectBankAccounts

PUT /api/banking/accounts/:accountId/classify
  Resource: Bank account
  Action: Classify bank account (operating, savings, etc.)
  Auth: verifyAccessToken
  Handler: domains/banking/banking.controller.ts — BankingController.classifyBankAccount

GET /api/banking/supported-countries
  Resource: Banking
  Action: Get supported countries for banking
  Auth: verifyAccessToken
  Handler: domains/banking/banking.controller.ts — BankingController.getSupportedCountries

GET /api/banking/test-connection/:provider
  Resource: Banking
  Action: Test connection to banking provider
  Auth: verifyAccessToken
  Handler: domains/banking/banking.controller.ts — BankingController.testConnection

POST /api/banking/sync-transactions
  Resource: Bank transaction
  Action: Manually trigger transaction sync
  Auth: verifyAccessToken
  Handler: domains/banking/banking.controller.ts — BankingController.syncTransactions

POST /api/banking/set-sync-date
  Resource: Banking
  Action: Set transaction sync start date
  Auth: verifyAccessToken
  Handler: domains/banking/banking.controller.ts — BankingController.setTransactionSyncDate

GET /api/banking/sync-status/:credentialId
  Resource: Banking
  Action: Get sync status for credential
  Auth: verifyAccessToken
  Handler: domains/banking/banking.controller.ts — BankingController.getTransactionSyncStatus

POST /api/banking/company-credentials
  Resource: Bank credential
  Action: Create company banking credential
  Auth: verifyAccessToken
  Handler: domains/banking/banking.controller.ts — createCredential
```

### Banks

```
GET /api/banks
  Resource: Bank
  Action: List all banks
  Auth: verifyAccessToken
  Handler: domains/banking/banks/banks.controller.ts — getAllBanksController

GET /api/banks/by-id/:id
  Resource: Bank
  Action: Get bank by ID
  Auth: verifyAccessToken
  Handler: domains/banking/banks/banks.controller.ts — getBankByIdController

GET /api/banks/by-key/:key
  Resource: Bank
  Action: Get bank by key
  Auth: verifyAccessToken
  Handler: domains/banking/banks/banks.controller.ts — getBankByKeyController

GET /api/banks/by-country
  Resource: Bank
  Action: Get banks by country
  Auth: verifyAccessToken
  Handler: domains/banking/banks/banks.controller.ts — getBankByCountryController
```

### Bank Accounts

```
POST /api/:companyId/bank-accounts
  Resource: Bank account
  Action: Create bank account
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/banking/bankAccounts/bankAccounts.controller.ts — createBankAccountController

GET /api/:companyId/bank-accounts
  Resource: Bank account
  Action: List bank accounts
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/banking/bankAccounts/bankAccounts.controller.ts — getBankAccountsForCompany

GET /api/:companyId/bank-accounts/minimal
  Resource: Bank account
  Action: Get minimal bank account info
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/banking/bankAccounts/bankAccounts.controller.ts — getBankAccountsMinimal

PATCH /api/:companyId/bank-accounts
  Resource: Bank account
  Action: Update bank accounts
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/banking/bankAccounts/bankAccounts.controller.ts — updateBankAccountsController
```

### Bank Feed Providers

```
GET /api/bank-feed-providers
  Resource: Bank feed provider
  Action: List available providers
  Auth: verifyAccessToken
  Handler: domains/banking/bankFeedProviders/bankFeedProviders.controller.ts — getBankFeedProvidersController
```

### Bank Transactions

```
POST /api/:companyId/bank-accounts/transactions/import
  Resource: Bank transaction
  Action: Import bank transactions
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/bankTransactions/bankTransactions.controller.ts — handleTransactionImport

POST /api/:companyId/bank-accounts/transactions/delete
  Resource: Bank transaction
  Action: Delete bank transactions
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/bankTransactions/bankTransactions.controller.ts — handleTransactionDeletion

POST /api/:companyId/bank-accounts/transactions/batches/:batchId/reverse
  Resource: Bank transaction batch
  Action: Reverse batch of transactions
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/bankTransactions/bankTransactions.controller.ts — handleBatchReversal
```

### Categorization

```
GET /api/:companyId/categorization/transactions
  Resource: Categorization
  Action: List categorization transactions
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/categorization/categorization.controller.ts — getCategorizationTransactionsController

GET /api/:companyId/categorization/stats
  Resource: Categorization
  Action: Get categorization statistics
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/categorization/categorization.controller.ts — getCategorizationStatsController

POST /api/:companyId/categorization/intents
  Resource: Categorization
  Action: Submit categorization intent (user categorization decision)
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/categorization/categorization.controller.ts — handleCategorizationIntentController
```

### Contacts

```
POST /api/:companyId/contacts/resolutions/query
  Resource: Contact resolution
  Action: Query contact resolution review queue
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — getContactResolutionReviewQueueController

POST /api/:companyId/contacts/resolutions/confirm
  Resource: Contact resolution
  Action: Confirm contact resolution
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — confirmContactResolutionController

POST /api/:companyId/contacts/resolutions/link-observed
  Resource: Contact resolution
  Action: Link observed counterparty to existing contact
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — linkObservedCounterpartyToContactController

POST /api/:companyId/contacts/resolutions/create-contact
  Resource: Contact
  Action: Create contact from observed counterparty
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — createContactFromObservedCounterpartyController

POST /api/:companyId/contacts/resolutions/ignore-observed
  Resource: Contact resolution
  Action: Ignore observed counterparty
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — ignoreObservedCounterpartyController

POST /api/:companyId/contacts/resolutions/reject-inferred-contact
  Resource: Contact resolution
  Action: Reject inferred contact suggestion
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — rejectInferredContactController

POST /api/:companyId/contacts/aliases/query
  Resource: Contact alias
  Action: Query contact aliases
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — getContactAliasesController

PATCH /api/:companyId/contacts/aliases/:aliasId/reassign
  Resource: Contact alias
  Action: Reassign alias to different contact
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — reassignContactAliasController

DELETE /api/:companyId/contacts/aliases/:aliasId
  Resource: Contact alias
  Action: Delete contact alias
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — deleteContactAliasController

POST /api/:companyId/contacts/query
  Resource: Contact
  Action: Query contacts
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — getContactsController

POST /api/:companyId/contacts
  Resource: Contact
  Action: Create contacts
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — addContactsController

PATCH /api/:companyId/contacts
  Resource: Contact
  Action: Update contacts
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — updateContactsController

DELETE /api/:companyId/contacts/:contactId
  Resource: Contact
  Action: Delete contact
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/contacts/contacts.controller.ts — deleteContactController
```

### Projects

```
POST /api/:companyId/projects/query
  Resource: Project
  Action: Query projects
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/projects/projects.controller.ts — getProjectsController

POST /api/:companyId/projects
  Resource: Project
  Action: Create projects
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/projects/projects.controller.ts — addNewProjectsController

PATCH /api/:companyId/projects
  Resource: Project
  Action: Update projects
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/projects/projects.controller.ts — updateProjectsController

DELETE /api/:companyId/projects/:projectId
  Resource: Project
  Action: Delete project
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/projects/projects.controller.ts — deleteProjectController
```

### Settings

```
GET /api/:companyId/settings
  Resource: Company settings
  Action: Get company settings
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/settings/settings.controller.ts — getSettingsController

PUT /api/:companyId/settings
  Resource: Company settings
  Action: Update company settings
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/settings/settings.controller.ts — updateSettingsController
```

### AI

```
POST /api/:companyId/ai/chat
  Resource: AI chat
  Action: Send chat message for AI analysis
  Auth: verifyAccessToken, checkCompanyId, basicLimiter
  Handler: domains/ai/ai.chat.controller.ts — chatAiController

GET /api/:companyId/ai/threads
  Resource: AI thread
  Action: List conversation threads
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/ai/ai.threads.controller.ts — listThreadsController

POST /api/:companyId/ai/threads
  Resource: AI thread
  Action: Create conversation thread
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/ai/ai.threads.controller.ts — createThreadController

GET /api/:companyId/ai/threads/:threadId/messages
  Resource: AI message
  Action: Get messages in thread
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/ai/ai.threads.controller.ts — getThreadMessagesController

POST /api/:companyId/ai/approvals/:approvalId/execute
  Resource: AI approval
  Action: Execute AI-generated approval
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/ai/approvals.controller.ts — executeApprovalController

POST /api/:companyId/ai/approvals/:approvalId/reject
  Resource: AI approval
  Action: Reject AI-generated approval
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/ai/approvals.controller.ts — rejectApprovalController
```

### Reporting & Close Readiness

```
GET /api/:companyId/period-status
  Resource: Period status
  Action: Get fiscal period status
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/reporting/fiscal-calendar/period-status.controller.ts — getPeriodStatusController

POST /api/:companyId/close-readiness/decisions
  Resource: Close decision
  Action: Record close review decision (approve/reject)
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/reporting/close-readiness/close-readiness.controller.ts — recordCloseReviewDecisionController

POST /api/:companyId/close-readiness/signals/recompute
  Resource: Close signals
  Action: Recompute close readiness signals for period
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/reporting/close-readiness/close-readiness.controller.ts — recomputeCloseSignalsController
```

### Notifications

```
GET /api/:companyId/notifications
  Resource: Notification
  Action: Get notification feed
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/notifications/notifications.controller.ts — getNotificationsController

GET /api/:companyId/notifications/unread-count
  Resource: Notification
  Action: Get unread notification count
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/notifications/notifications.controller.ts — getUnreadCounterController

GET /api/:companyId/notifications/preferences
  Resource: Notification preference
  Action: Get notification preferences
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/notifications/notifications.controller.ts — getNotificationPreferencesController

PUT /api/:companyId/notifications/preferences
  Resource: Notification preference
  Action: Set notification preferences
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/notifications/notifications.controller.ts — setNotificationPreferenceController

POST /api/:companyId/notifications/viewed
  Resource: Notification
  Action: Mark notifications as viewed
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/notifications/notifications.controller.ts — markNotificationsViewedController

POST /api/:companyId/notifications/mark-all-read
  Resource: Notification
  Action: Mark all notifications as read
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/notifications/notifications.controller.ts — markAllNotificationsReadController

POST /api/:companyId/notifications/:notificationId/read
  Resource: Notification
  Action: Mark single notification as read
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/notifications/notifications.controller.ts — markNotificationReadController
```

### Work Queue

```
GET /api/:companyId/work-queue
  Resource: Work queue
  Action: Get categorization work queue status
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/work/work-queue.controller.ts — getWorkQueueController
```

### Support Access

```
GET /api/:companyId/support-access/grants
  Resource: Support grant
  Action: List support access grants
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/support-access/support-access.controller.ts — listSupportGrantsController

POST /api/:companyId/support-access/grants
  Resource: Support grant
  Action: Create support access grant
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/support-access/support-access.controller.ts — createSupportGrantController

POST /api/:companyId/support-access/grants/:grantId/revoke
  Resource: Support grant
  Action: Revoke support access grant
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/support-access/support-access.controller.ts — revokeSupportGrantController

POST /api/:companyId/support-access/break-glass-sessions
  Resource: Break glass session
  Action: Open break glass session
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/support-access/support-access.controller.ts — openBreakGlassSessionController

POST /api/:companyId/support-access/break-glass-sessions/:sessionId/close
  Resource: Break glass session
  Action: Close break glass session
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/support-access/support-access.controller.ts — closeBreakGlassSessionController
```

### File Storage

```
POST /api/:companyId/files/upload-intents
  Resource: File
  Action: Create signed upload intent
  Auth: verifyAccessToken, checkCompanyId, requireUploadIntentAccess
  Handler: domains/objects/objects.controller.ts — createUploadIntentController

POST /api/:companyId/files/finalize
  Resource: File
  Action: Finalize file upload
  Auth: verifyAccessToken, checkCompanyId, requireFinalizeUploadIntentAccess
  Handler: domains/objects/objects.controller.ts — finalizeUploadIntentController

GET /api/:companyId/files/url/download
  Resource: File
  Action: Get file download URL
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/objects/objects.controller.ts — getPrivateFileDownloadUrlController

DELETE /api/:companyId/company-logo
  Resource: Company logo
  Action: Delete company logo
  Auth: verifyAccessToken, checkCompanyId, requireCompanyLogoMutationAccess
  Handler: domains/objects/objects.controller.ts — deleteCompanyLogoController

POST /api/:companyId/objects/txn-files
  Resource: Transaction file
  Action: Upload transaction files
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/objects/objects.controller.ts — uploadTxnFilesController

POST /api/:companyId/objects/get-txn-files
  Resource: Transaction file
  Action: Retrieve transaction files
  Auth: verifyAccessToken, checkCompanyId
  Handler: domains/objects/objects.controller.ts — getTxnFilesController
```

---

## Health & Admin (no JWT)

```
GET /health/live
  Resource: System
  Action: Liveness probe (always returns 200 if process is alive)
  Auth: none
  Handler: health.ts — createHealthRouter

GET /health/ready
  Resource: System
  Action: Readiness probe (checks Postgres + Redis connectivity)
  Auth: none
  Handler: health.ts — createHealthRouter

/admin/queues/*
  Resource: BullMQ dashboard
  Action: View and manage job queues
  Auth: HTTP Basic Auth (BULLBOARD_USER/BULLBOARD_PASSWORD)
  Handler: lib/bullboard.ts (Bull Board adapter)

/api-docs
  Resource: API documentation
  Action: Swagger/OpenAPI UI
  Auth: none
  Handler: docs/swagger.ts
```

---

## Queue Consumers (BullMQ Workers)

These process jobs enqueued by the application. Auth is internal (application-triggered, no external input gate).

```
email (queue: email)
  Jobs: send_verification_email, send_user_invite_email
  Handler: features/communications/email/email.worker.ts

commsDispatch (queue: comms-dispatch)
  Jobs: delivery, scan_due_deliveries, purge_old_deliveries
  Handler: features/comms/comms.worker.ts

transactionSync (queue: transaction-sync)
  Jobs: sync-transactions, bulk-sync, periodic
  Handler: integrations/banking/jobs/transaction-sync.worker.ts

balanceRecalc (queue: balance-recalc)
  Jobs: gl-balance, bank-balance
  Handler: domains/balances/balance-recalc.worker.ts

fiscalCalendar (queue: fiscal-calendar)
  Jobs: generate-calendar, fill-coverage-gaps, auto-extend
  Handler: domains/reporting/fiscal-calendar/fiscal-calendar.worker.ts

enrichment (queue: bank-transactions-enrichment)
  Jobs: transaction enrichment
  Handler: domains/categorization/enrichment/enrichment.worker.ts

ruleRunner (queue: rule-runner)
  Jobs: run-rule
  Handler: domains/categorization/rules/rule-runner.worker.ts

mlPrediction (queue: ml-prediction)
  Jobs: predict
  Handler: domains/categorization/ml/ml-prediction.worker.ts

autopost (queue: categorization-autopost)
  Jobs: autopost-candidate
  Handler: domains/categorization/autopost/autopost.worker.ts

journalAutoReversal (queue: journal-auto-reversal)
  Jobs: scan-due, reverse-one
  Handler: domains/journals/auto-reversal.worker.ts

recurringTemplates (queue: recurring-journal-templates)
  Jobs: recurring-template-scan
  Handler: domains/journals/recurring-templates.worker.ts

taskEvaluation (queue: task-evaluation)
  Jobs: evaluate-client, sweep
  Handler: domains/tasks/task-evaluation.worker.ts

closeSignalEval (queue: close-signal-eval)
  Jobs: close-signal-eval
  Handler: domains/reporting/close-readiness/signals/close-signal-eval.worker.ts

outboxDispatch (queue: outbox-dispatch)
  Jobs: dispatch
  Handler: domains/work/outbox.worker.ts
```

---

## Auth Model Summary

| Layer          | Mechanism                                                        | Scope             |
| -------------- | ---------------------------------------------------------------- | ----------------- |
| Identity       | `verifyAccessToken` — JWT from HTTP-only cookie                  | Global            |
| Company access | `checkCompanyId` — validates user belongs to company             | Per-company       |
| CSRF           | `conditionalCsrf` — double-submit cookie pattern                 | Mutating requests |
| Rate limiting  | `authLimiter` (auth routes), `basicLimiter` (AI chat)            | Per-IP            |
| File upload    | `requireUploadIntentAccess`, `requireFinalizeUploadIntentAccess` | Per-resource      |
| File delete    | `requireCompanyLogoMutationAccess`                               | Per-resource      |
| Admin          | HTTP Basic Auth                                                  | BullBoard only    |
| Webhook        | Optional Plaid signature verification                            | Plaid only        |

**Ambiguities flagged:**

- Banking routes (`/api/banking/*`) require `verifyAccessToken` but NOT `checkCompanyId` — company context comes from the request body, not the URL. This means the company-access gate is inside the controller/service logic, not middleware.
- `POST /api/onboarding/advance` uses `verifyRefreshToken` not `verifyAccessToken` — this is intentional since the user may not have a full access token during onboarding.
- The ledger routes (`PUT` and `PATCH /api/:companyId/ledgers`) both map to the same handler — `PATCH` is an alias for `PUT`.
