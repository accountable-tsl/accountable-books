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

### 3. System Auto-Posts

Close the categorization work item.

```text
status = resolved
resolved_reason = posted_to_ledger
```

### 4. User Posts Manually

Close the categorization work item.

```text
status = resolved
resolved_reason = posted_to_ledger
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

## Work Item Table

`work_items` stores the real work.

One row means one thing someone can finish.

Recommended fields:

```text
id

company_id
period_id nullable
bank_account_id nullable

work_key
family
action_type
status
resolution_type nullable

root_type
root_id

target_type
target_id

responsible_party
assigned_user_id nullable

actionability
priority
severity
due_at nullable

title
summary nullable

state_hash nullable
version

opened_at
last_changed_at
resolved_at nullable
snoozed_until nullable

created_at
updated_at
```

### Important Fields

`work_key` is the stable identity of the work item.

Examples:

```text
categorization:bank_transaction:123
finding_review:finding:789
bank_reconnect:bank_account:555
close_question:period:2026-06:revenue_complete
```

`family` is the broad area.

Examples:

```text
categorization
finding
close
journal
banking
internal_ops
```

`action_type` is what needs doing right now.

Examples:

```text
categorize_transaction
review_suggestion
review_finding
answer_close_question
post_draft_journal
reconnect_bank
approve_close
```

`root_type` and `root_id` point to the stable thing this work belongs to.

For categorization:

```text
root_type = bank_transaction
root_id = bank_transaction id
```

For finding review:

```text
root_type = finding
root_id = finding id
```

`target_type` and `target_id` point to what the user acts on right now.

For example, categorization work may start with:

```text
target_type = bank_transaction
target_id = bank transaction id
```

Then change to:

```text
target_type = categorization_candidate
target_id = candidate id
```

`state_hash` is a fingerprint of the facts behind the work.

It helps the system know whether the work is still based on the same facts.

### Work Item Statuses

Use these statuses:

```text
open
in_progress
resolved
superseded
cancelled
```

Use `resolution_type` to explain how resolved work ended.

Examples:

```text
completed
posted_to_ledger
accepted_as_is
not_applicable
false_positive
resolved_by_fact_change
no_longer_needed
```

### Responsible Party

Use this to say who is expected to act:

```text
firm_user
client_user
internal_admin
system
provider
```

### Actionability

Use this to say whether the responsible party can act now:

```text
actionable_now
waiting_on_client
waiting_on_provider
internal_issue
waiting_on_system
blocked_by_dependency
```

## Work Item Events Table

`work_item_events` stores history of a work item.

It answers:

```text
How did this work item get here?
Who changed it?
What changed?
When did it change?
```

Recommended fields:

```text
id
work_item_id

event_type

actor_type
actor_id nullable

from_status nullable
to_status nullable

from_action_type nullable
to_action_type nullable

message nullable
payload jsonb

idempotency_key nullable
occurred_at
created_at
```

Event types:

```text
opened
action_changed
assigned
unassigned
status_changed
commented
agent_proposed_fix
user_applied_fix
user_accepted_as_is
marked_not_applicable
marked_false_positive
resolved
cancelled
superseded
snoozed
reopened
```

Example event history:

```text
opened: categorize_transaction
action_changed: categorize_transaction -> review_suggestion
assigned: Sarah
resolved: posted_to_ledger
```

## Findings Table

`findings` stores possible accounting issues.

Recommended fields:

```text
id

company_id
period_id

finding_key
finding_code
severity

subject_type
subject_id

source_type
source_id nullable

title
explanation

evidence jsonb
facts_hash

status
resolution_type nullable

first_seen_at
last_seen_at
resolved_at nullable
superseded_at nullable

created_at
updated_at
```

### Important Fields

`finding_key` is the stable identity for the finding.

Example:

```text
company:123:period:2026-06:bank_to_revenue:ledger_txn:999
```

`finding_code` is the kind of issue.

Examples:

```text
bank_to_revenue_on_accrual_basis
missing_contact_on_receivable
depreciation_missing_after_asset_addition
draft_recurring_journal_not_posted
```

`subject_type` and `subject_id` point to the thing being questioned.

Examples:

```text
ledger_transaction
ledger_entry
journal_batch
period
account
```

`facts_hash` is a fingerprint of the facts behind the finding.

If the facts change, old decisions may no longer apply.

### Finding Statuses

Use these statuses:

```text
open
closed
superseded
```

Use `resolution_type` to explain why a finding closed.

Examples:

```text
accepted_as_is
not_applicable
false_positive
resolved_by_fact_change
```

## Finding Decisions Table

`finding_decisions` stores a user or agent response to a finding.

This is for cases where the user does not necessarily fix the books, but gives an answer.

Recommended fields:

```text
id

finding_id
company_id
period_id

decision
facts_hash

actor_type
actor_id nullable

reason nullable
notes nullable
payload jsonb

decided_at
created_at
```

Decision values:

```text
accepted_as_is
not_applicable
false_positive
```

These are intentionally few.

They match the real choices a user should have when they decide not to change the books:

```text
accepted_as_is
I reviewed this and the posting is okay.

not_applicable
This check does not apply in this case.

false_positive
The system is wrong about this issue.
```

Do not use `needs_fix` as a finding decision.

If the user chooses to fix the issue, they should change the real facts.

Then the system recalculates the finding and closes it as:

```text
resolved_by_fact_change
```

Important rule:

```text
A decision only applies while the finding facts_hash stays the same.
```

If the ledger changes and the finding facts change, the old decision should not silently carry forward.

## Work Queue Groups Table

`work_queue_groups` stores grouped queue rows.

It is a display cache built from open work items.

It is not the source of work truth.

Recommended fields:

```text
id

workspace_company_id nullable
company_id nullable
period_id nullable

queue_key
surface
group_type

title
summary nullable

status
action_type
family

responsible_party
assigned_user_id nullable

actionability
priority
severity

open_item_count
due_item_count
overdue_item_count

destination jsonb
filters jsonb

first_seen_at
last_seen_at
last_built_at
closed_at nullable

created_at
updated_at
```

### Important Fields

`workspace_company_id` is the company whose workspace shows the group.

Examples:

```text
firm queue = firm company id
client dashboard = client company id
internal ops queue = null or internal workspace id
```

`company_id` is the company whose books the group is about.

For firm-managed work:

```text
workspace_company_id = firm company id
company_id = client company id
```

This field is allowed on queue groups because queue groups are display rows.

It should not be treated as the source of truth.

`queue_key` is the stable identity for the group.

Examples:

```text
firm_queue:company:123:categorize_transaction:unassigned
firm_queue:company:123:period:2026-06:review_finding
```

`surface` says where the group appears.

Examples:

```text
firm_queue
client_dashboard
close_page
internal_ops_queue
```

`destination` says where clicking the group sends the user.

Example:

```json
{
  "workspace": "categorization",
  "company_id": "company_123",
  "work_item_filter": "queue_key"
}
```

## Notification Digests Table

`notification_digests` stores generated summaries for recipients.

This supports:

```text
daily work brief
late-start reminder
weekly summary
close deadline summary
```

Recommended fields:

```text
id

recipient_type
recipient_user_id nullable
recipient_email nullable

workspace_company_id nullable
company_id nullable

digest_type
local_date
timezone

status

title
summary_text nullable

activity_summary jsonb
work_summary jsonb
queue_group_ids jsonb

scheduled_for nullable
generated_at nullable
sent_at nullable
opened_at nullable

email_status nullable
in_app_status nullable

idempotency_key

created_at
updated_at
```

`workspace_company_id` is the workspace the digest belongs to.

Examples:

```text
firm user's daily brief = firm company id
client user's daily brief = client company id
internal ops digest = null or internal workspace id
```

`company_id` is nullable because some digests cover many clients.

Digest types:

```text
daily_work_brief
late_start_reminder
weekly_summary
close_deadline_summary
```

Statuses:

```text
draft
ready
sent
skipped
failed
```

Example daily digest:

```text
Yesterday:
842 transactions imported
721 auto-posted
12 findings resolved

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
categorization work item resolved

activity_event:
Sarah categorized Amazon transaction

audit_event:
ledger transaction posted by Sarah
```

## Minimal V1 Tables

Build these:

```text
work_items
work_item_events

findings
finding_decisions

work_queue_groups

notification_digests

activity_events
audit_events
outbox_events
```

Keep the normal accounting tables:

```text
bank_transactions
categorization_candidates
ledger_transactions
ledger_entries
journal_batches
journal_entries
periods
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
