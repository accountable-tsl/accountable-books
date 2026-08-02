# 07 — Bank Providers in Production (Plaid + Mono)

Goal: real banks connect on production in both markets. The code is done — this
workstream is mostly credentials, registrations, and real-world verification. Its
calendar time is long (Plaid production approval takes weeks), so **submit the Plaid
application on day 1 of the launch push**, in parallel with everything else.

## Current state (verified 2026-07-19)

- Both providers implement the full current interface
  (`apps/api/src/integrations/banking/types/base.ts`): `createLinkToken`,
  `exchangeToken`, `getConnectionDetails`, `supportsTransactionSync`,
  `fetchTransactionUpdate`, `handleError`.
  - Plaid: `providers/plaid.provider.ts` (has unit tests, OAuth callback page in web).
  - Mono: `providers/mono.provider.ts` (439 lines, real implementation; web widget at
    `apps/web/src/features/connect-bank/ui/providers/mono-widget.tsx`).
- Provider enablement is DB-driven (`bank_feed_providers` table + registry at
  `providers/registry.ts`), mapped to countries. Bootstrap catalog seeds it.
- Sync is provider-agnostic and robust: per-account cursors, leased outbox execution
  (15-min leases, defer-while-collecting, retry budget), daily BullMQ scan writing
  sync intents, webhook-driven wake for Plaid. The last week of commits hardened
  exactly this (reconnect/rematch as connection replace, reauth for selected
  accounts, disconnect notifications, webhook payload purging).
- **Plaid webhooks: durable** (store-then-outbox, `plaid.webhook.ts` routes mounted
  publicly in `app.ts`). **Mono has no webhook receiver** — Mono connections update
  via the daily scan + manual sync. That is acceptable at launch (decided; adding a
  Mono webhook receiver is post-launch backlog).
- Staging config note: `fly.staging.toml` sets `ENABLE_TRANSACTION_SYNC = "false"` —
  remember to enable it where you want real syncs to run, and confirm the production
  toml's worker env allows sync.

## Steps

### Plaid (US)

1. **Day 1:** apply for production access in the Plaid dashboard (company details,
   security questionnaire, use-case). While waiting, everything works in sandbox.
2. Register production webhook URL (`https://api.getaccountable.com` + the path in
   `plaid.webhook.ts`) and the OAuth redirect URI for the production web domain
   (the web callback page is `features/connect-bank/ui/plaid-oauth-callback.tsx`).
3. Confirm which Plaid products the code uses (transactions sync; check the link
   token creation in `plaid.provider.ts`) and enable only those, to keep per-item
   costs down.
4. When approved: set production keys via Fly secrets; flip the provider row/env for
   production; connect a REAL US bank account (your own) end to end.

### Mono (Nigeria)

1. Create/verify the Mono production app; complete their business verification
   (CAC docs etc. — start early, it can take days).
2. Set production keys in Fly secrets. Confirm scopes cover accounts + transactions.
3. Connect a REAL Nigerian bank account (your own GTB/Access/etc.) end to end.
4. Verify the daily scan cadence is acceptable for Mono-only updates (no webhooks):
   check the scheduler's scan interval; decide if a manual "Sync now" button
   affordance is prominent enough in the workspace UI (it exists —
   `useManualTransactionSync`).

### Both — real-world verification on production

Run for each provider with a real account and record in
`my-notes/launch/smoke-runs.md`:

- connect → accounts appear with correct names/masks/currency;
- initial history import completes (watch outbox sync intents to `processed`;
  historical import offer behavior for >30d history);
- new real transaction (buy something) arrives within a day (Plaid: webhook-driven;
  Mono: next scan/manual);
- balances match the bank app (per `bank_account_current_native_balances` anchor);
- disconnect from the bank side → product notifies and marks connection state
  (the notify-on-disconnect path landed in commit c94290af);
- reauth/reconnect flow rebinds the SAME ledger accounts (the rematch-as-replace UX
  from commits 20269508/0610a3b2) — no duplicated history (d6111322 covered this;
  verify live).

## Success criteria

- [ ] Plaid production approval granted; keys live; one real US bank connected on
      production with webhook-driven update observed.
- [ ] Mono production keys live; one real Nigerian bank connected on production with
      scan-driven update observed.
- [ ] Reconnect/reauth exercised live once per provider without duplicate
      transactions (assert by count before/after).
- [ ] A written runbook note: "bank connection broken — what to check" (provider
      dashboard, connection state in DB, outbox intents, webhook event log) in
      `my-notes/launch/runbooks.md`.
- [ ] Webhook payload purging + sync-run retention confirmed running in production
      (commit 9b186ad5's scheduled purge — check scheduler logs).

## Out of scope

Mono webhook receiver, additional providers/countries, institution-specific quirks
beyond the two verification accounts, Plaid Assets/Auth products, connection health
dashboards beyond the existing sync-health endpoint (6fa75130).
