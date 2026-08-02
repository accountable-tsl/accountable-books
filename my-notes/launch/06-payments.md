# 06 — Payments (Gate B)

Goal: a firm can pay for the product with a real card. Decided: launch requires real
payments. This plan puts payments at **Gate B** so design partners (Gate A) are not
blocked on it — they run comped/invoiced. If you want payments before any firm
touches production, do this workstream before 03/04; nothing else changes.

## Current state (verified 2026-07-19)

- `apps/api/src/domains/billing/` — **phases 1–2 complete**: plan catalog, billing
  accounts, workspace billing ownership, resolver, provisioning hooks. Its README
  defines the intended slice order: **subscriptions → provider checkout + webhooks →
  internal invoices.** Follow it; the groundwork was designed for exactly this.
- Billing contracts exist in `packages/contracts` (source/accounting/billing.ts and
  source/billing/).
- Web: `apps/web/src/modules/company/billing/api/index.ts` is a mock (plans, a fake
  current subscription, contact-sales link). The settings page renders it.
- **No payment provider SDK anywhere in the repo yet.**
- A durable webhook pattern already exists and is tested: Plaid webhooks are
  store-then-outbox (`domains/banking/bank-provider-webhook-events/` + commit
  dd530854). Payment webhooks must reuse this pattern, not invent a new one.

## Design decisions (made, with one input needed from Temi)

1. **One payment provider first.** Two markets ≠ two integrations at Gate B.
   - Nigerian firms paying in NGN → **Paystack**.
   - US firms paying in USD → **Stripe**.
   **Decision needed: which cohort pays first?** Pick that provider; the other
   geography gets manual invoicing ("contact us" on the billing page) until
   post-launch. The billing domain's provider-agnostic design (billing accounts /
   ownership separate from "provider-specific payment execution") exists precisely so
   the second provider is an add, not a rework.
2. **Subscriptions slice** per the billing README: subscription entity tied to the
   billing account (which already owns workspaces), states (trialing/active/past_due/
   canceled), plan reference into the existing catalog. Migrations follow
   `my-notes/migrations.md` conventions.
3. **Checkout:** provider-hosted page (Paystack transaction / Stripe Checkout
   Session). Endpoint creates the session for the firm's billing account and
   redirects; success/cancel URLs land back in settings/billing. No card data ever
   touches the API.
4. **Webhooks:** verify signature → persist raw event (store) → write outbox intent →
   handler updates subscription state idempotently. Copy the banking webhook module's
   shape. Failed handlers dead-letter and alert (`ADMIN_ALERT_EMAILS` path already
   built).
5. **Entitlements are soft at launch.** Past_due/no-subscription shows banners and
   nags; it does not lock the books. Accountants with client deadlines must never be
   hard-locked by a billing bug in week one. Hard enforcement is a post-launch
   decision with data.
6. **Web swap:** replace the billing mock with real endpoints: current subscription,
   available plans (from the real catalog), start-checkout, and a billing-history
   stub (empty list is fine at Gate B). Keep contact-sales for the non-integrated
   geography.

## Steps

1. Confirm provider choice with Temi (blocking input).
2. Subscriptions migration + service + tests (state machine transitions, one active
   subscription per billing account).
3. Checkout session endpoint + redirect handling.
4. Webhook receiver: signature verify (test vectors from provider docs), store,
   outbox intent, idempotent handler. Tests: replayed event = no double state
   change; out-of-order events resolve to correct terminal state.
5. Entitlement read model: one function the web can ask "what plan/status is this
   workspace on" — wire the banner.
6. Web billing page swap; keep it minimal (current plan, change/checkout button,
   status).
7. End-to-end in provider test mode on staging: subscribe → webhook → status
   active → banner clears. Then one real live-mode charge on production with your
   own card, refunded.

## Success criteria

- [ ] A firm on staging completes checkout in provider test mode; subscription is
      active in DB; billing page reflects it without manual refresh tricks.
- [ ] Webhook replay/idempotency test green; dead-letter alert observed once by
      forcing a handler failure in staging.
- [ ] Live-mode charge + refund executed once on production (your card), recorded in
      `my-notes/launch/smoke-runs.md`.
- [ ] Soft entitlement: canceling in test mode produces banners, never a lockout.
- [ ] `grep -rn "MOCK_" apps/web/src/modules/company/billing` → empty (contact-sales
      link for the second geography is real copy, not mock data).

## Out of scope

Second provider, internal invoices PDF, credits/wallets, payout ledgers, managed-
workspace wholesale billing, client sell-price billing (all listed as later slices in
the billing README), dunning sequences, tax/VAT handling on fees, plan
grandfathering.
