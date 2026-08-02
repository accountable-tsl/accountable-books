# Accounting Work System: Final Model

Status: final product/engineering direction

This document defines the simple standard for how work appears in the app.

It is not based on the current code names. This is the model we should build toward.

## The Main Rule

Facts create work.

Work is stored as work items.

The queue groups work items.

Notifications summarize what needs attention.

User actions change facts or decisions.

Then work is recalculated.

In short:

```text
Facts -> work items -> queue groups -> notifications
User action -> facts/decisions -> recalculate work
```

## The Names We Will Use

Use these names consistently.

```text
work_item
One thing someone can finish.

work_item_event
History of what happened to a work item.

finding
A possible accounting issue found by the system.

finding_decision
A user or agent response to a finding.

work_queue_group
A grouped row shown in a queue.

notification_digest
A daily, weekly, or deadline-based summary.

activity_event
Friendly product history shown to users.

audit_event
Strict proof of important business, accounting, or security changes.

outbox_event
Reliable background handoff after facts change.
```

Important rule:

```text
work_item means one finishable piece of work.
work_queue_group means a grouped queue row.
```

Never use `work_item` to mean the grouped queue card.

## The Main Objects

### Bank Transaction

Money moved in or out of a bank account.

This is a real fact.

Example:

```text
Amazon paid $42 on July 1.
```

### Candidate

The system's suggested accounting entry for a bank transaction.

This is not yet the books.

Example:

```text
Suggested posting: debit software expense, credit bank.
```

### Ledger Transaction

What has actually been posted to the books.

This is accounting truth.

### Finding

A possible accounting issue found by the system.

Example:

```text
This accrual-basis company posted bank money directly to revenue.
```

A finding explains what may be wrong.

It is not the work itself.

### Work Item

One clear thing someone can finish.

Examples:

```text
Categorize one bank transaction.
Review one suggestion.
Review one finding.
Post one draft journal.
Answer one close question.
Reconnect one bank account.
Approve one period close.
```

### Work Queue Group

A grouped row shown to users.

Examples:

```text
Client A: Categorize 100 transactions.
Client A: Review 42 suggestions.
Client A: Review 7 accounting findings.
Client A: Post 3 draft journals.
```

A work queue group is display only.

The real work is in `work_items`.

## Finding Vs Work Item

A finding and a work item are different.

```text
finding = what may be wrong
work_item = what someone must do about it
```

Example:

```text
Finding:
Bank transaction was posted directly to revenue for an accrual-basis company.

Work item:
Review this finding. Fix it, accept it, or mark it not applicable.
```

Why keep both?

Because not all work items are findings.

These are work items, but not findings:

```text
Categorize transaction.
Review suggestion.
Reconnect bank.
Post draft journal.
Answer close question.
Approve close.
```

And findings need accounting evidence, while work items need assignment, status, action, due date, and routing.

## The Bank Transaction Flow

### 1. Bank Transaction Arrives

Save the bank transaction.

Create one work item:

```text
root = bank_transaction_123
action_type = categorize_transaction
target = bank_transaction_123
status = open
```

The root stays stable.

The target may change.

### 2. System Creates A Suggestion

Update the same work item.

```text
root = bank_transaction_123
action_type = review_suggestion
target = candidate_456
status = open
```

This is not a new unrelated work item.

It is the same work becoming more specific.

### 2a. User Rejects The Suggestion

If the bank transaction is still unposted, keep the same work item and move it back to categorization.

```text
root = bank_transaction_123
action_type = categorize_transaction
target = bank_transaction_123
status = open
```

The rejected candidate keeps its own candidate history.

The work item continues to represent the unfinished bank transaction.

### 3. System Auto-Posts

Close the categorization work item.

```text
status = closed
work_item_event = closed { reason: posted_to_ledger }
```

### 4. User Posts Manually

Close the categorization work item.

```text
status = closed
work_item_event = closed { reason: posted_to_ledger }
```

### 5. Ledger Checks Run

If checks find nothing, do nothing.

If checks find an issue, create a finding.

Then create a work item for that finding.

```text
finding = finding_789
subject = ledger_transaction_999

work_item:
root = finding_789
action_type = review_finding
target = finding_789
status = open
```

The original bank transaction can still be linked as evidence.

But the new work is about the finding, not about categorizing the bank transaction.

## How Many Work Items?

Use this rule:

```text
One work item = one independently finishable piece of work.
```

If five checks all mean the same user action, create one work item with five reasons.

Example:

```text
Missing contact.
Missing customer.
Missing counterparty.
```

These all mean:

```text
Add the required contact.
```

So create one work item.

If five checks require five separate user actions, create five work items.

Example:

```text
Add missing contact.
Attach support or mark unavailable.
Review direct bank-to-revenue posting.
Confirm unusual fixed asset movement.
Answer close question.
```

Those can be completed separately, so they are separate work items.

## Current State In The App

The app must always check real facts before acting.

The queue can be slightly stale for a moment.

The server cannot be stale when accepting an action.

Example:

```text
User sees "Categorize transaction".
ML posts the transaction one second later.
User clicks the old button.
Server checks the bank transaction and sees it is already posted.
Server refuses the old action and returns the latest state.
```

Temporary stale screens are allowed.

Wrong actions are not allowed.

## Source Facts

The work system does not duplicate accounting facts.

It points to the real objects:

- `bank_transactions` - bank statement lines; categorization starts here.
- `categorization_candidates` - suggested accounting entries; suggestion review acts here.
- `ledger_transactions` and `ledger_entries` - posted books; transaction checks run here.
- `journal_batches` and `journal_entries` - draft and posted journal work.
- `fiscal_calendar` - period and close scope.
- `notifications`, `notification_idempotency_keys`, and `comms_deliveries` - attention feed, idempotency, and delivery.
- `activity_events` - friendly user-facing history.
- `audit_events` - strict proof of important business, accounting, and security changes.
- `outbox_events` - reliable async handoff after facts change.

Rules:

- Work tables never copy accounting facts.
- `work_items` are the finishable work.
- `work_queue_groups` are grouped display rows.
- `findings` are accounting issues that may need review.

## Recalculation

Source facts are truth.

`work_items`, `findings`, and `work_queue_groups` are stored results of those facts.

That means they must be recalculated with discipline.

Process:

1. A source fact changes.
2. The same transaction writes an `outbox_event`.
3. Duplicate outbox work is combined by `(intent, scope_key)`.
4. One worker takes the advisory lock for that scope.
5. The worker recomputes the desired findings and work items from source facts only.
6. The worker inserts or updates rows that should be open.
7. The worker closes rows that no longer exist in the desired set.
8. The worker rebuilds affected `work_queue_groups`.
9. The worker writes `work_item_events` only for visible work changes.

Examples of scope keys:

- `company:{company_id}:bank_account:{bank_account_id}` - bank transaction categorization.
- `company:{company_id}:ledger_transaction:{ledger_transaction_id}` - transaction-level checks.
- `company:{company_id}:period:{period_id}` - period-level checks and close work.

Hard rules:

- Never decide current work from old work rows alone.
- Never decide current findings from old finding rows alone.
- Always recompute the desired set from bank, candidate, ledger, journal, and period facts.
- Recalculate findings and their work items in the same scope.
- Close missing rows with a conditional update, so already-closed rows are not changed again.
- User and agent actions must re-check `state_hash` or `facts_hash` before applying.
- If the hash is stale, reject the action and return the latest state.

This is the rule that prevents drift.

## Work Item Table

`work_items` stores the real work.

One row means one thing someone can finish.

Fields:

- `id` - primary key.
- `company_id` - the company whose books this work belongs to; use this because `bank_transactions`, `categorization_candidates`, `ledger_transactions`, `ledger_entries`, and `fiscal_calendar` already use company scope.
- `period_id nullable` - `fiscal_calendar.id` when the work belongs to a period; nullable because bank reconnects, provider issues, and some internal failures are not period work.
- ~~`firm_id` - do not store this; derive it from company assignment/membership because the firm can change and this is not the accounting fact.~~
- ~~`bank_account_id nullable` - do not store this on the work item; derive it from `bank_transactions` or use `root_type = bank_account` for bank reconnect work.~~
- `work_key` - stable idempotent identity for this exact piece of work.
- `family` - broad product area for filtering and grouping.
- `action_type` - what must be done next.
- `status` - the small lifecycle state of the work item.
- ~~`resolution_type` - do not store a global resolution enum; different work types close for different reasons, so closure details belong in the closing `work_item_event.payload`.~~
- `root_type` - the stable source object this work belongs to.
- `root_id` - the id of the stable source object.
- `target_type` - the object the user or agent acts on right now.
- `target_id` - the id of the current target object.
- `responsible_party` - the party expected to move this forward.
- `assignee_type nullable` - `user` or `agent` when a specific actor is assigned; this keeps humans and agents on the same model.
- `assignee_id nullable` - the assigned user id now, or future agent id later.
- ~~`assigned_user_id nullable` - too narrow; it forces a later agent-specific column or table.~~
- `actionability` - whether the responsible party can act now or the work is waiting on someone/something else.
- `priority` - operational urgency for sorting, reminders, and escalation.
- ~~`severity` - do not duplicate finding severity here; map finding severity into priority when creating the work item.~~
- `due_at nullable` - deadline for close work, client follow-up, or escalations.
- `title` - short text shown in the queue.
- `summary nullable` - one or two sentence context for the queue or detail page.
- `state_hash nullable` - fingerprint of the facts used to create the current work state; prevents stale user actions and duplicate async updates.
- `version` - monotonic integer for optimistic updates when the app acts on a work item.
- `opened_at` - when this work first became active.
- `last_changed_at` - when the visible work state last changed.
- `closed_at nullable` - when there is no remaining work on this item.
- ~~`resolved_at nullable` - use `closed_at`; "resolved" makes every work type sound like a problem.~~
- `snoozed_until nullable` - hides the item until a chosen time without closing it.
- `created_at` - database creation time.
- `updated_at` - database update time.

`work_key` examples:

- `categorization:bank_transaction:123` - one categorization item for one bank transaction.
- `finding_review:finding:789` - one review item for one finding.
- `bank_reconnect:bank_account:555` - one reconnect item for one bank account.
- `close_question:period:2026-06:revenue_complete` - one close question for one period.

`family` values:

- `categorization` - bank transaction categorization and suggestion review.
- `finding` - accounting issue review.
- `close` - month-end or year-end close work.
- `journal` - draft, recurring, or reversing journal work.
- `banking` - bank connection work.
- `internal_ops` - work only our internal team can handle.

`action_type` values:

- `categorize_transaction` - user must choose accounting treatment for a bank transaction.
- `review_suggestion` - user must approve or edit a categorization candidate.
- `review_finding` - user must fix, accept, or mark an accounting finding as not applicable.
- `answer_close_question` - user must answer a close review question.
- `post_draft_journal` - user must post or dismiss a draft journal.
- `reconnect_bank` - client must reconnect bank access.
- `approve_close` - user must perform the final close approval.
- `resolve_internal_issue` - internal team must fix an operational problem.

`root_type` and `root_id` keep the same work item attached to the same fact as the target changes.

Example:

```text
Bank transaction arrives:
root_type = bank_transaction
root_id = bank_transaction id
target_type = bank_transaction
target_id = bank transaction id
action_type = categorize_transaction

Candidate is created:
root_type = bank_transaction
root_id = same bank_transaction id
target_type = categorization_candidate
target_id = candidate id
action_type = review_suggestion
```

That is how the system knows this is the same bank transaction moving through states.

Work item statuses:

- `open` - visible work exists.
- `in_progress` - a user or agent has started but has not finished.
- `closed` - no work remains.
- `cancelled` - an operator deliberately removed the work item without completing it.
- ~~`resolved` - use `closed`; resolution details belong in events, not a status enum.~~
- ~~`superseded` - use `closed` plus a closing event payload such as `{ "reason": "candidate_changed" }`.~~

Responsible party values:

- `firm_user` - the bookkeeping firm must act.
- `client_user` - the client must act, such as reconnecting a bank.
- `internal_admin` - our internal team must act.
- `system` - automation is expected to finish the work; use sparingly and usually do not show it as user work.
- ~~`provider` - a provider cannot act inside our app; show provider outage as status or attention, not provider-owned work.~~

Actionability values:

- `actionable_now` - the responsible party can act now.
- `waiting_on_client` - firm can see the item, but the next move belongs to the client.
- `waiting_on_provider` - no user can fix it now; use for provider outage status or a blocked work item.
- `internal_issue` - our team needs to act before the user can continue.
- `blocked_by_dependency` - another work item or fact must change first.
- ~~`waiting_on_system` - too vague; use `system` responsible party for true automation work or `internal_issue` when automation is stuck.~~

Priority values:

- `low` - useful context, not urgent.
- `normal` - default user work.
- `high` - important or close to a deadline.
- `critical` - blocks close, money movement, bank access, or a major customer workflow.

## Work Item Events Table

`work_item_events` stores history for a work item.

It is not the product audit log.

It answers:

```text
How did this work item get here?
Who or what changed it?
What changed?
When did it change?
```

Fields:

- `id` - primary key.
- `work_item_id` - the work item whose history this row belongs to.
- `event_type` - the kind of change.
- `actor_type` - `user`, `agent`, or `system`.
- `actor_id nullable` - user id or future agent id; null only for `system`.
- `from_status nullable` - previous status when status changed.
- `to_status nullable` - new status when status changed.
- `from_action_type nullable` - previous action when the required action changed.
- `to_action_type nullable` - new action when the required action changed.
- `message nullable` - human-readable comment, if any.
- `payload jsonb` - small structured details that do not deserve columns.
- `idempotency_key nullable` - prevents duplicate events from retried async jobs.
- `occurred_at` - when the event happened.
- `created_at` - when the row was written.

Event types:

- `opened` - work became active.
- `changed` - target, action, title, priority, or actionability changed.
- `assigned` - assignee changed; use payload to show old and new assignee.
- `commented` - user or agent left a note.
- `snoozed` - hidden until a later time.
- `closed` - work ended; payload carries the local reason.
- `cancelled` - operator cancelled the work item.
- `reopened` - previously closed work became active again.
- ~~`action_changed` - use `changed`; avoid one event enum per changed field.~~
- ~~`status_changed` - use `changed` for non-closing status changes and `closed` for closure.~~
- ~~`unassigned` - use `assigned` with null assignee in the payload.~~
- ~~`agent_proposed_fix` - use `commented` or `changed` with `actor_type = agent`; do not create agent-only event types.~~
- ~~`user_applied_fix` - the fix should change the real accounting fact; this event table only records the work-item side.~~
- ~~`user_accepted_as_is` - this belongs in `finding_decisions`, not as a work item event type.~~
- ~~`marked_not_applicable` - this belongs in `finding_decisions`, not as a work item event type.~~
- ~~`marked_false_positive` - this belongs in `finding_decisions`, not as a work item event type.~~
- ~~`resolved` - use `closed`.~~
- ~~`superseded` - use `closed` with a local reason in payload.~~

Example event history:

```text
opened: categorize_transaction
changed: categorize_transaction -> review_suggestion
assigned: Sarah
closed: { "reason": "posted_to_ledger" }
```

## Findings Table

`findings` stores possible accounting issues.

It is for accounting review, not every kind of operational problem.

Bank reconnects, provider outages, and internal sync bugs are work items or status messages, not findings.

A finding row is not accounting truth.

It is the stored result of a check against accounting truth.

We store findings because the product needs:

- a stable `finding_id` for work items, decisions, comments, activity, and future agent actions.
- `first_seen_at`, so users can see how long an issue has been open.
- finding-level history that survives queue regrouping.
- one queue where categorization, findings, and close work can be assigned and tracked together.

The cost is that findings must be recalculated like work items.

If a check no longer fires, close the finding.

If the same check fires with changed facts, update `facts_hash` and make old decisions stop applying.

If a work item points to a finding that no longer fires, close that work item in the same recalculation scope.

Fields:

- `id` - primary key.
- `company_id` - the company whose books contain the issue.
- `period_id` - `fiscal_calendar.id`; not nullable for v1 because accounting findings belong to a transaction period or close period.
- `finding_key` - stable idempotent identity for the finding.
- `finding_code` - the check that produced the finding.
- `severity` - accounting seriousness of the issue.
- `subject_type` - the thing being questioned.
- `subject_id` - the id of the thing being questioned.
- ~~`source_type` - do not add until we introduce stored control runs; `finding_code` already says which check found it.~~
- ~~`source_id nullable` - do not add until stored control runs exist.~~
- `title` - short display text.
- `explanation` - plain-language reason the issue matters.
- `evidence jsonb` - small facts needed to explain the issue in the UI.
- `facts_hash` - fingerprint of the facts behind the finding.
- `status` - whether the finding is currently open or closed.
- ~~`resolution_type nullable` - do not store another global closure enum; closure comes from facts changing or a matching `finding_decision`.~~
- `first_seen_at` - when this finding first appeared.
- `last_seen_at` - when the check last confirmed it still existed.
- `closed_at nullable` - when it stopped requiring review.
- ~~`resolved_at nullable` - use `closed_at` for the same reason as work items.~~
- ~~`superseded_at nullable` - not needed in v1; update the same finding when facts change and use `facts_hash` to invalidate old decisions.~~
- `created_at` - database creation time.
- `updated_at` - database update time.

`finding_key` example:

```text
company:123:period:2026-06:bank_to_revenue:ledger_txn:999
```

`finding_code` values start in code, not in a user-authored rule builder.

Initial values:

- `bank_to_revenue_on_accrual_basis` - bank receipt posted directly to revenue for an accrual company.
- `missing_contact_on_receivable` - receivable posting has no contact.
- `missing_contact_on_payable` - payable posting has no contact.
- `depreciation_posted_from_bank` - bank transaction posted directly to depreciation.
- `depreciation_missing_after_asset_addition` - fixed assets increased but depreciation did not.
- `draft_recurring_journal_not_posted` - recurring journal draft exists but was never posted.

Subject types:

- `ledger_transaction` - the whole posting is being questioned.
- `ledger_entry` - one line is being questioned.
- `journal_batch` - a draft or posted journal is being questioned.
- `period` - a period-level condition is being questioned.
- ~~`account` - do not use in v1 unless there is a concrete account-level fix flow; period findings can reference account ids inside `evidence`.~~

Finding statuses:

- `open` - issue currently requires a fix or decision.
- `closed` - issue no longer requires review because facts changed or a valid decision exists.
- ~~`superseded` - not needed in v1; facts changes are handled by `facts_hash`.~~

Severity values:

- `low` - minor quality issue.
- `medium` - normal review issue.
- `high` - likely accounting error or close blocker.
- `critical` - severe close, reporting, or compliance risk.

## Finding Decisions Table

`finding_decisions` stores a user or agent response to a finding.

It is only for cases where the user decides not to change the books.

If the user fixes the issue, the real accounting facts change and the finding closes from recalculation.

Fields:

- `id` - primary key.
- `finding_id` - the finding being answered.
- `company_id` - copied from finding for fast period/client reporting and tenant safety.
- `period_id` - copied from finding for close reporting.
- `decision` - the user's or agent's answer.
- `facts_hash` - the exact finding facts this decision applies to.
- `actor_type` - `user` or `agent`; decisions are judgments made by an actor.
- `actor_id` - user id now, or future agent id later.
- ~~`actor_type = system` - the system should close findings by recalculation, not by pretending to make a judgment.~~
- `reason nullable` - required by the UI for `not_applicable` and `false_positive`; optional for `accepted_as_is`.
- ~~`notes nullable` - duplicate of `reason`; use one text field.~~
- ~~`payload jsonb` - do not add until a real decision needs structured fields.~~
- `decided_at` - when the decision was made.
- `created_at` - when the row was written.

Decision values:

- `accepted_as_is` - the reviewer looked at the issue and says the books are okay as posted.
- `not_applicable` - the check does not apply to this situation.
- `false_positive` - the system is wrong and the finding should not count.
- ~~`needs_fix` - not a decision; the user should fix the real facts instead.~~
- ~~`acknowledged` - too vague; it does not say whether the books are okay, the check is not applicable, or the system is wrong.~~
- ~~`dismissed` - too vague and too easy to abuse; use `not_applicable` or `false_positive`.~~

Important rule:

```text
A decision only applies while the finding facts_hash stays the same.
```

If the ledger changes and the finding facts change, the old decision should not silently carry forward.

The system normally does not write finding decisions.

If facts changed, close by recalculation.

If a check should not apply because of settings or policy, do not create the finding.

Use a system-written decision only if we later introduce an explicit approved automation policy that is allowed to make accounting judgments.

## Work Queue Groups Table

`work_queue_groups` stores grouped queue rows.

It is a display cache built from open work items.

It is not the source of work truth.

Fields:

- `id` - primary key.
- `workspace_company_id nullable` - the workspace where the group appears; firm workspace, client workspace, or null/internal for ops.
- `company_id nullable` - the company whose books the group is about; nullable for cross-client firm summaries.
- `period_id nullable` - period being grouped, if this is close or period work.
- `queue_key` - stable idempotent identity for this displayed group.
- `surface` - the screen where the group appears.
- `group_type` - the layout/meaning of the group.
- `title` - text shown on the queue row.
- `summary nullable` - short context, such as "100 transactions across 3 accounts".
- ~~`status` - group state is derived; if no open items remain, rebuild or delete the group.~~
- `action_type` - main action represented by this group.
- `family` - broad product area represented by this group.
- `responsible_party` - who owns the next move for the grouped items.
- `assignee_type nullable` - user or agent when the group is for one assignee.
- `assignee_id nullable` - assigned user id now, or future agent id later.
- ~~`assigned_user_id nullable` - too narrow for the same reason as work items.~~
- `actionability` - whether the grouped work is actionable now.
- `priority` - highest operational priority among the grouped work items.
- ~~`severity` - do not store separately; finding severity is already mapped into work item priority.~~
- `open_item_count` - number of open work items in the group.
- `due_item_count` - number of open items with a due date.
- `overdue_item_count` - number of open items past due.
- ~~`destination jsonb` - do not store route JSON; API can derive routes from `surface`, `action_type`, and `queue_key`.~~
- ~~`filters jsonb` - do not store opaque filters; `queue_key` should resolve the item query.~~
- `first_seen_at` - when this group first appeared.
- ~~`last_seen_at` - duplicate of `updated_at` for a cache row.~~
- `last_built_at` - when the cache row was last rebuilt.
- ~~`closed_at nullable` - group closure is derived; do not maintain a fake lifecycle.~~
- `created_at` - database creation time.
- `updated_at` - database update time.

`workspace_company_id` examples:

- firm queue - firm company id.
- client dashboard - client company id.
- internal ops queue - null or internal workspace id.

`company_id` example:

```text
workspace_company_id = firm company id
company_id = client company id
```

`queue_key` examples:

- `firm_queue:company:123:categorize_transaction:unassigned` - one firm's queue group for one client's uncategorized transactions.
- `firm_queue:company:123:period:2026-06:review_finding` - one firm's finding group for one client period.
- `firm_queue:all_clients:categorize_transaction` - cross-client summary for a firm user.

`surface` values:

- `firm_queue` - main firm work queue.
- `client_dashboard` - client-facing home screen.
- `close_page` - period close screen.
- `internal_ops_queue` - internal operational queue.

`group_type` values:

- `work_list` - opens a list of work items.
- `client_rollup` - summarizes one client.
- `period_rollup` - summarizes one close period.
- `internal_rollup` - summarizes internal operational work.

## Notification Digests Table

`notification_digests` stores generated summary content.

It does not send email.

It does not track read state.

The existing `notifications` and `comms_deliveries` tables already do that.

Fields:

- `id` - primary key.
- ~~`recipient_type` - not needed in v1; digests are generated for users.~~
- `recipient_user_id` - the user receiving the digest.
- ~~`recipient_email nullable` - duplicate of `users.email`; delivery address belongs to `comms_deliveries`.~~
- `workspace_company_id nullable` - workspace the digest belongs to.
- `company_id nullable` - company the digest is about; nullable when the digest covers many clients.
- `digest_type` - kind of digest.
- `local_date` - recipient's local date for the digest.
- `timezone` - timezone used to calculate the local date and reminder time.
- `status` - generation/publication state, not delivery state.
- `title` - title used for in-app and email summary.
- `summary_text nullable` - short human-readable summary.
- `activity_summary jsonb` - snapshot of what happened.
- `work_summary jsonb` - snapshot of what needs work.
- ~~`queue_group_ids jsonb` - queue groups are cache rows and may be rebuilt; store the summary snapshot instead.~~
- `scheduled_for nullable` - when the digest should be published.
- `generated_at nullable` - when content was generated.
- ~~`sent_at nullable` - delivery timing belongs to `comms_deliveries`.~~
- ~~`opened_at nullable` - read/open state belongs to `notifications` or delivery analytics, not digest content.~~
- ~~`email_status nullable` - delivery status belongs to `comms_deliveries`.~~
- ~~`in_app_status nullable` - feed status belongs to `notifications`.~~
- `idempotency_key` - prevents duplicate digest generation for the same user/date/type.
- `created_at` - database creation time.
- `updated_at` - database update time.

`workspace_company_id` examples:

- firm user's daily brief - firm company id.
- client user's daily brief - client company id.
- internal ops digest - null or internal workspace id.

Digest types:

- `daily_work_brief` - yesterday's activity plus today's current work.
- `late_start_reminder` - same brief sent only if the user has not started by the chosen workday time.
- `weekly_summary` - manager/owner summary across the week.
- `close_deadline_summary` - close-focused summary near a deadline.

Digest statuses:

- `generated` - content exists but has not been published to notifications/comms.
- `published` - digest was handed to the notification system.
- `skipped` - no meaningful content or policy said not to publish.
- `failed` - generation failed and should be retried or inspected.
- ~~`draft` - unnecessary extra state for v1.~~
- ~~`ready` - unclear difference from `generated`.~~
- ~~`sent` - delivery state belongs to `comms_deliveries`.~~

Example daily digest:

```text
Yesterday:
842 transactions imported
721 auto-posted
12 findings closed

Today:
3 clients need categorization
1 client has close blockers
2 bank accounts need reconnect
```

## Notifications

Do not notify every event.

Default to digest-first.

In-app daily brief:

```text
What happened yesterday.
What needs work today.
```

Email:

```text
Only if meaningful work exists and the user has not started by the chosen time.
```

Weekly summary:

```text
For managers and owners.
```

Immediate alerts should be rare.

Send immediate alerts for:

```text
bank auth expired
close blocked near deadline
high-severity finding
work assigned or reassigned
client action needed
internal failure needing ops attention
```

Do not send immediate alerts for normal background churn.

## Bank Disconnects And Failures

Not everything belongs in the bookkeeper queue.

Use this rule:

```text
If the recipient can act, create a work item for them.
If they cannot act but should know, show status or attention.
If it is our problem, route it internally.
```

Examples:

```text
Client auth expired:
client work item: reconnect bank
firm sees: waiting on client

Bank provider outage:
status/attention message
not bookkeeper work

Internal sync bug:
internal admin work item
customer sees: sync delayed

Bookkeeper can fix it:
firm user work item
```

## Queue Rebuilds

When work items change, rebuild queue groups for the affected scope.

Do not rebuild once per row.

Example:

```text
1,000 bank transactions arrive.
1,000 work items may be created.
1 queue rebuild is requested for that client or bank account.
```

Example:

```text
Automation updates 700 work items.
1 queue rebuild is requested for that client.
```

The queue group table is a cache.

If it is deleted, rebuild it from open work items.

## Month-End Close

Month-end close uses the same work model.

It is not a separate task system.

At close time, the system creates or updates work items for:

```text
uncategorized transactions
draft journals
open findings
close questions
approval to close
```

The close page shows one header:

```text
Close June 2026
```

Under it, show grouped work:

```text
Categorize 100 transactions
Post 3 draft journals
Review 7 findings
Answer 4 questions
```

When all required close work is done, create the final work item:

```text
Approve and close June 2026
```

## History Tables Do Different Jobs

Do not collapse these into one table.

They answer different questions.

```text
work_item_events
What happened to this piece of work?

activity_events
What should users see in the friendly timeline?

audit_events
What strict proof do we need for accounting, business, or security changes?
```

Example:

User posts a transaction from a categorization work item.

Write:

```text
work_item_event:
categorization work item closed

activity_event:
Sarah categorized Amazon transaction

audit_event:
ledger transaction posted by Sarah
```

## Minimal V1 Tables

New standard tables for this area:

```text
work_items
work_item_events

findings
finding_decisions

work_queue_groups

notification_digests
```

Use these surrounding tables:

```text
bank_transactions
categorization_candidates
ledger_transactions
ledger_entries
journal_batches
journal_entries
fiscal_calendar
notifications
notification_idempotency_keys
comms_deliveries
activity_events
audit_events
outbox_events
```

## What To Defer

Do not build these in v1 unless we clearly need them:

```text
control_runs
control_results
complex workflow runs
separate task tables
per-user queue rows
full event sourcing
user-authored rule builder
separate agent work queues
```

Controls can live in code for v1.

When facts change, controls run.

If they find an issue, they create or update a finding.

If the user responds, write a finding decision.

If facts change later, reopen or supersede the finding.

## Final Standard

Use this as the permanent mental model:

```text
Facts are truth.
Work items are work.
Findings explain possible accounting issues.
Queue groups are display.
Notifications are attention.
Activity is friendly history.
Audit is proof.
Outbox is reliable handoff.
```
