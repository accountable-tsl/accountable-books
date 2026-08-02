# Notification + Comms System Design

Status: updated planning doc, pending approval before implementation.

This design covers two separate systems:

- **Notifications**: user-facing in-app records of things that need attention, with feed, unread count, read/seen state, and preferences.
- **Comms**: internal delivery service that sends already-renderable messages to humans through providers such as email, SMS, Slack, or future channels.

The approved boundary is unchanged: product code calls `notify(event)`, and the notification system may call `comms.send(payload)`. `comms.send()` is the only coupling point. `alertAdmins(event)` bypasses notifications and calls comms directly for operational alerts.

No existing signup, resend-verification, invitation, or support-access email flow is migrated as part of this design unless explicitly approved later.

## Phase 0 Findings

Users are identity records in `app.users`. Tenant workspaces are `app.companies`. Direct membership is `app.user_company_roles`. Firm-managed client access is represented by `app.client_firm_assignments`, and per-staff client ownership by `app.firm_user_client_assignments`. Notification records should therefore be per-recipient-user and org-aware via optional `firm_company_id` and `client_company_id`; preference resolution remains per-user only.

Current signup email is isolated: signup/auth call `sendVerificationEmail()`, which enqueues the existing `email` BullMQ queue. The email worker renders the verification/invite templates and `sendEmail()` chooses the existing dev/Postmark/SES runtime sender. This stays untouched.

BullMQ conventions to follow:

- queue files use `createQueue`
- enqueue helpers wrap `executeQueueOperation`
- job payloads use `withJobTelemetry`
- workers use `runWithJobContext`
- workers are registered in the job registry
- retry/backoff/remove-on-complete/remove-on-fail are explicit per queue

Product-specific notification candidates:

- work item assigned to a bookkeeper
- work item reassigned to another staff member
- assigned work becomes overdue or escalated
- bank reconnect requires user/client/admin action
- client query requires response
- close package approval requested, rejected, or stale after material change
- report delivery failed and user action is required
- sync/import failure only when a normal user can fix the condition

Routine imports, autoposts, ML suggestions, journal posts, and close recomputation remain activity events unless policy says attention is required.

## UX Read Model

Use the approved hybrid model.

Routine low/normal notifications are marked read when viewed after a short dwell. For these, unread means "new to me."

High/critical/action-required notifications set `seen_at` automatically when viewed, but keep `read_at` null until explicit per-item read, click/open, or mark-all. This avoids silently clearing bank reconnects, overdue work, close approval requests, or stale packages.

Read state never means work completion. Work state remains owned by the domain/work tables.

## System Boundaries

`notify(NotifyEvent)` owns:

- recipient resolution
- notification idempotency
- notification feed records
- unread counter updates
- preference resolution
- choosing whether to request comms delivery

`comms.send(CommsSendPayload)` owns:

- delivery idempotency
- queueing delivery jobs
- provider selection
- provider retry/fail/dead-letter state
- delivery audit records

`comms.send()` must not know or query notification feed rows, unread/read state, preferences, work items, activity rows, or Postgres notification records. It receives a plain payload and logs delivery.

`notify()` must not import provider SDKs, inspect provider internals, know BullMQ job names, or render provider-specific transport details.

`alertAdmins(AdminAlertEvent)` resolves recipients from static admin-alert config and calls `comms.send()` with `correlation.source = 'admin_alert'`. It creates no notification row and no unread state.

## Typed Comms Correlation

`comms_deliveries.correlation` is not untyped JSON in the application contract. The column can physically be `jsonb`, but every write/read goes through this explicit type:

```ts
export type CommsCorrelation =
  | { source: 'notification'; id: string }
  | { source: 'admin_alert'; id: string };
```

`CommsSendPayload` must carry `correlation: CommsCorrelation`.

This is intentionally narrow. Comms can correlate a delivery back to the caller's opaque record id, but it cannot receive notification-shaped fields such as `recipientUserId`, `readAt`, `workItemId`, preferences, or feed metadata. If a future caller needs comms, it must add a new discriminant to `CommsCorrelation`, not smuggle product data through arbitrary JSON.

## Data Model

### `notifications`

User-facing feed record.

- `id uuid primary key default uuid_generate_v7()`
- `recipient_user_id uuid not null references app.users(id)`
- `firm_company_id uuid null references app.companies(id)`
- `client_company_id uuid null references app.companies(id)`
- `event_type text not null`
- `priority text not null check in ('low', 'normal', 'high', 'critical')`
- `read_policy text not null check in ('auto_on_view', 'explicit')`
- `title text not null`
- `body text null`
- `destination jsonb not null default '{}'::jsonb`
- `source_entity_type text null`
- `source_entity_id uuid null`
- `source_entity_key text null`
- `activity_event_id uuid null references app.activity_events(id)`
- `work_item_id uuid null references app.work_items(id)`
- `work_item_subject_id uuid null references app.work_item_subjects(id)`
- `idempotency_key text not null`
- `seen_at timestamptz null`
- `read_at timestamptz null`
- `archived_at timestamptz null`
- `occurred_at timestamptz not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Unique key: `(recipient_user_id, idempotency_key)`.

Indexes:

- unread by recipient: `(recipient_user_id, created_at desc) where read_at is null and archived_at is null`
- feed by recipient: `(recipient_user_id, created_at desc) where archived_at is null`
- company-scoped feed: `(recipient_user_id, client_company_id, created_at desc) where archived_at is null`

`work_item_id` points to the grouped queue row the user sees, such as "Categorize 8 transactions." `work_item_subject_id` points to the exact actionable subject under that row, such as one specific bank transaction or categorization candidate. The column name is clear because it matches the existing `work_item_subjects` table and distinguishes the grouped row from the precise unit of work; keep `work_item_subject_id`.

### `notification_counters`

Denormalized unread count.

- `user_id uuid primary key references app.users(id)`
- `unread_count integer not null default 0 check (unread_count >= 0)`
- `last_unread_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Use denormalized counters. Insert increments only when a notification is newly inserted unread. Read transitions use `UPDATE ... WHERE read_at IS NULL RETURNING id`, then decrement by the returned row count. This is correct with two tabs because only one transaction can transition a row from unread to read.

### `notification_preferences`

Per-user overrides only.

- `id uuid primary key default uuid_generate_v7()`
- `user_id uuid not null references app.users(id)`
- `notification_type text not null`
- `channel text not null`
- `delivery_mode text not null check in ('off', 'immediate', 'digest')`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Unique key: `(user_id, notification_type, channel)`.

Preference defaults are **live code defaults**, not materialized at user creation. Resolution is:

1. find user override row for `(user_id, notification_type, channel)`
2. if absent, use the code default registry
3. if the type/channel is unknown, fail closed for external delivery and keep in-app only if a notification was already created

Reason: adding a new notification type later should not require a user-table backfill. The cheaper failure mode is a deploy-time code default review; the expensive failure mode is missing or stale rows across existing users. This matches the system's goal of cheap future notification types and channels.

### `comms_deliveries`

Comms-owned delivery audit table.

- `id uuid primary key default uuid_generate_v7()`
- `idempotency_key text not null unique`
- `channel text not null`
- `provider_key text null`
- `recipient_address text not null`
- `template_key text not null`
- `template_version integer not null`
- `priority text not null`
- `delivery_mode text not null`
- `batch_key text null`
- `status text not null check in ('queued', 'batched', 'sending', 'sent', 'delivered', 'failed', 'dead', 'suppressed')`
- `attempt_count integer not null default 0`
- `provider_message_id text null`
- `provider_response jsonb null`
- `last_error text null`
- `correlation jsonb not null`
- `queued_at timestamptz not null default now()`
- `sent_at timestamptz null`
- `delivered_at timestamptz null`
- `failed_at timestamptz null`
- `next_attempt_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Application type for `correlation` is always `CommsCorrelation`.

No `notification_deliveries` table in v1. That name would blur the boundary. Comms records correlation to the caller, not notification semantics.

## Idempotency

Notification idempotency:

- durable key: unique `(recipient_user_id, idempotency_key)`
- Redis short-circuit may use `notify:seen:{hash}` with a 14-day TTL after durable success
- Redis is only an optimization; Postgres is the correctness boundary

Comms idempotency:

- `idempotency_key = comms:{correlation.source}:{correlation.id}:{channel}:{templateKey}:v{templateVersion}:{recipientAddress}`
- unique key on `comms_deliveries.idempotency_key`
- duplicate `comms.send()` returns existing delivery state and does not call the provider again

## Comms Provider Interface

```ts
interface CommsProvider<C extends Channel> {
  key: string;
  channel: C;
  supports: {
    html?: boolean;
    text?: boolean;
    attachments?: boolean;
  };
  send(message: RenderedCommsMessage<C>): Promise<{
    providerMessageId?: string;
    raw?: unknown;
  }>;
}
```

Provider files are named by concrete provider and channel, e.g. `postmark-email.provider.ts`, `ses-email.provider.ts`, `twilio-sms.provider.ts`.

Adding a second email provider requires:

1. one new provider file
2. one-line provider registration

It must not require changes to `notify()`, `comms.send()`, the channel router, or templates.

## Priority, Batching, And Templates

Priority behavior:

- `critical`: immediate, never batched
- `high`: immediate by default
- `normal`: immediate, debounce, or digest by preference
- `low`: digest or in-app only

Debounce is a short batching window, not a separate mechanism. Comms stores batchable rows by `batch_key`, schedules one delayed BullMQ job, renders the batch at flush time, and records the provider result against all included delivery rows.

Templates are in-code and deploy-versioned:

```ts
registry['work.assigned'].email = {
  version: 1,
  render(data) {
    return { subject, html, text };
  },
};
```

Template registry key shape is `(event_type, channel) -> render function`.

## Naming

Approved names:

- `notify()`: product-facing notification entry point
- `alertAdmins()`: ops/admin alert entry point
- `comms.send()`: internal delivery-service entry point
- `Notification`: persisted user-facing feed record only
- `NotifyEvent`: the event passed into `notify()`
- `AdminAlertEvent`: the event passed into `alertAdmins()`
- `CommsSendPayload`: the payload crossing into comms
- `CommsCorrelation`: typed comms correlation contract

Do not call raw product events "notifications." Use `NotifyEvent` or `SystemEvent`.

## EMAIL_PROVIDER Mismatch Decision

Current mismatch: `.env.example` documents `EMAIL_PROVIDER=ethereal`; runtime email sender expects `dev`, `postmark`, or `ses`.

Decision: **explicit deferred item**, not a silent fix in the comms work.

This remains broken until a separate cleanup is approved. It must not be quietly fixed inside the notification/comms implementation PR. Before Phase 2 comms provider work starts, either:

- approve a one-line unrelated cleanup changing the documented local value to the runtime-supported value, or
- explicitly sign off again that the existing mismatch remains while the new comms system is built alongside it

This keeps the existing signup email path untouched and makes the cleanup visible.

## Build Sequencing And Checkpoints

### Phase 1: Notification System With Comms Stubbed

Build:

- `notifications`
- `notification_counters`
- `notification_preferences`
- `notify(event)`
- idempotency
- feed API
- unread API
- read/seen APIs
- preference resolution using live code defaults
- `comms.send()` no-op stub

Acceptance tests:

- duplicate notify inserts one notification
- duplicate notify increments unread once
- two tabs marking read cannot double-decrement
- mark-all read decrements by actual changed rows
- code defaults apply when no preference row exists
- in-app feed works without real comms

### Phase 2: Comms With One Real Email Provider

Build:

- `comms_deliveries`
- `CommsCorrelation`
- `CommsSendPayload`
- `comms.send()`
- comms dispatch queue/worker
- template registry
- first email provider, likely `postmark-email.provider.ts`

Acceptance tests:

- duplicate `comms.send()` does not duplicate provider call
- failed provider records retryable failure
- exhausted retries dead-letter
- typed `correlation` rejects notification-shaped payloads

Do not silently fix the `EMAIL_PROVIDER` mismatch in this phase.

### Phase 3: Second Provider Validation

Build:

- `ses-email.provider.ts` or equivalent second provider
- one-line registration

Acceptance tests:

- no changes to `notify()`
- no changes to `comms.send()`
- no changes to template registry
- no changes to router

### Required Checkpoint Before Phase 4

Stop before Phase 4 and submit a specific integration plan for review.

Phase 4 is the first point that touches real domain/work-assignment behavior outside the new notification/comms modules. It must not start under a generic "integration" approval.

The Phase 4 plan must answer:

- where `notification_requested` is written in the existing transactional outbox flow
- whether it is emitted directly from `materializeWork()` or from a post-materialization diff/rule layer
- what exact work-item transition counts as "new assigned work"
- how assignment uses existing `resolveEffectiveOwnerUserId()` / `loadEffectiveOwnerUserIds()`
- how idempotency is derived from work item id, assignee id, event type, and assignment transition
- how rerunning materialization avoids duplicate notifications
- how solving work makes an old notification route to current state instead of dead data
- what existing files outside the new modules are touched

Implementation may proceed only after that Phase 4 integration plan is reviewed.

### Phase 4: First Real Notification Rule

Target rule after checkpoint approval:

- a new assigned work item creates exactly one notification for the assignee

Likely integration shape, subject to checkpoint review:

- add `OUTBOX_INTENT.NOTIFICATION_REQUESTED`
- add dispatcher branch that calls notification module
- add a work-transition rule that emits a notification intent after committed materialization
- use `work-ownership.ts` as the shared owner resolver rather than duplicating assignment logic

Acceptance tests:

- new assigned work item creates one notification
- rematerialization does not duplicate it
- unassigned work does not notify a user
- reassignment has its own idempotent event
- normal import/autopost activity does not notify

## Open Questions / Risks

- Static admin-alert recipient config name should be confirmed, recommended: `ADMIN_ALERT_EMAILS`.
- Provider delivery webhooks for delivered/bounced status can be v2; v1 can record queued/sent/failed.
- Support-access break-glass emails are existing direct email calls. They remain untouched until migration is explicitly approved.
- Signup verification email remains untouched until migration is explicitly approved.
