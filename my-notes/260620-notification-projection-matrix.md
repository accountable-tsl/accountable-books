# Notification Projection Matrix V1

## Purpose

This matrix decides which user-facing projections a domain occurrence should
produce:

- **Activity:** historical product timeline/audit record. "What happened?"
- **Work item:** current actionable state. "What needs doing?"
- **Notification:** human attention record. "Who needs to notice or act?"
- **Comms:** external delivery of selected notification or alert transitions.
- **Ops alert:** internal operational failure alert. Never a user notification.

One domain occurrence can produce multiple projections. Example:

```txt
Bank transactions imported
  -> Activity: yes
  -> Work item: yes, if unposted/reviewable work exists
  -> Notification: only if attention opens/escalates
  -> Comms: only if the notification transition warrants external delivery
  -> Ops alert: only if the system failed internally
```

Core rule: do not notify because an event happened. Notify because someone needs
attention, action, approval, recovery, or re-engagement.

## Default Channel Policy

These are implementation defaults, not final firm-level preferences.

| Situation                   | In-app    | Email                           | Chat/Slack/Teams | Notes                                        |
| --------------------------- | --------- | ------------------------------- | ---------------- | -------------------------------------------- |
| Active assigned work opened | immediate | policy: first_assignment or off | off for now      | In-app is primary.                           |
| Routine automation success  | off       | off                             | off              | Activity/audit only.                         |
| Review required             | immediate | off by default                  | off for now      | Work queue is source of truth.               |
| Reconnect/failure/blocker   | immediate | immediate                       | off for now      | High urgency or blocking.                    |
| Approval requested/rejected | immediate | immediate                       | off for now      | Human decision required.                     |
| Overdue/escalated work      | immediate | immediate                       | off for now      | Re-engagement.                               |
| Summary/recap               | summary   | summary                         | off by default   | Deliberately composed, not raw event digest. |

External comms must be staleness-safe. Email/chat/push should nudge users back
to live app state; they should not pretend to be the source of truth.

## Delivery Planning And Preferences

Delivery planning must not be handled by comms. Notifications decide whether an
attention transition should create in-app attention and/or external delivery;
comms only sends already-resolved payloads.

Delivery planning order:

```txt
1. Product policy
   Does this attention type/transition allow in-app and/or external delivery?

2. Recipient resolution
   Which specific users should receive this attention?

3. User and future firm preferences
   Has this recipient turned this notification/channel off or on?

4. Channel availability
   Is the channel implemented, enabled for this firm/user, and configured?

5. Route resolution
   What concrete address/target should we send to? Example: email address,
   Slack user/channel id, Teams chat id.

6. Comms
   Send the concrete payloads that survived the earlier gates.
```

Current implementation status:

- Per-user notification preferences already exist for supported channels.
- Current supported preference channels are `in_app` and `email`.
- Current supported delivery modes are `off` and `immediate`.
- Defaults are live code defaults from the notification registry, not
  materialized rows for every user.
- User preference rows are overrides only.
- Chat/Slack/Teams/WhatsApp/SMS should not be exposed in preferences until we
  have route resolution and providers for those channels.

Do not materialize default preference rows for every user just to make the UI
look complete. Code defaults avoid backfills when new notification types are
added. The preferences API can return the effective defaults plus any user
overrides, which is the behavior we want.

The next delivery-planner improvement is to stop treating concrete channel names
as the primary product decision. Product policy should say whether an attention
transition allows external delivery; a central channel policy should then map
external delivery to currently supported channels.

Today:

```txt
external delivery -> email only
supported preference channels -> in_app, email
chat channels -> unavailable/hidden
```

Later:

```txt
external delivery -> email + Slack/Teams/etc, depending on firm/user settings
supported preference channels -> includes only channels with route resolution
```

This means adding Slack later should require adding Slack route resolution,
templates, provider/configuration, and one central registration. It should not
require touching every notification-producing domain flow.

## Attention Key Rules

`attention_key` identifies the durable thing a recipient needs to notice. It is
not the raw event id.

Rules:

- Stable across retries/replays.
- Specific enough to dedupe active attention.
- Recipient-specific when two people can independently need attention.
- Scoped to the relevant company/client/account object.
- Points to current source state whenever the attention can change.

Examples:

```txt
work_item:{workItemId}:assignee:{userId}
work_item:{workItemId}:participant:{userId}
bank_connection:{credentialId}
close_approval:{closeRunId}:approver:{userId}
report_delivery:{reportRunId}
client_query:{queryId}:recipient:{userId}
billing:{billingAccountId}:payment_failed
```

## Recipient Resolver Glossary

These names are placeholders for code-level resolver functions.

| Resolver                   | Meaning                                          |
| -------------------------- | ------------------------------------------------ |
| `actor`                    | The user who performed the action.               |
| `assigned_work_owner`      | Current assigned owner of a work item.           |
| `work_participants`        | Explicit temporary participants on a work item.  |
| `firm_client_owner`        | Effective owner/bookkeeper for a client company. |
| `firm_managers_for_client` | Firm managers/admins responsible for a client.   |
| `close_approvers`          | Users required to approve a close run/package.   |
| `close_preparer`           | User/team responsible for preparing the close.   |
| `report_recipient`         | Intended recipient of a report.                  |
| `billing_owner`            | Billing account owner/admin.                     |
| `affected_user`            | User whose account/security state changed.       |

## Projection Matrix

Legend:

- **A:** Activity projection.
- **W:** Work item projection.
- **N:** Notification projection.
- **O:** Ops alert projection.
- **Comms:** default external delivery behavior.

### Setup And Access

| Domain occurrence                  |   A |     W |                           N |   O | Attention key                                    | Source of truth             | Recipient resolver         | Open/update/resolve                                                                                                   | Unread behavior                        | Comms                                    | Priority    | Staleness-safe copy                                                             |
| ---------------------------------- | --: | ----: | --------------------------: | --: | ------------------------------------------------ | --------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| Bank account added                 | yes |    no | no, unless setup incomplete |  no | none                                             | `bank_accounts`             | actor                      | Historical only. If setup incomplete, use setup-needed row.                                                           | none                                   | off                                      | low         | n/a                                                                             |
| Could not auto-assign work         | yes |   yes |                         yes |  no | `assignment_needed:{clientCompanyId}:{workType}` | work materialization result | `firm_managers_for_client` | Open when work exists with no resolvable owner. Update when count/type changes. Resolve when assigned or work closes. | unread on open and material escalation | email if blocking; otherwise in-app only | medium/high | "Work needs assignment. Open Accountable for the latest queue."                 |
| Client/user assigned or reassigned | yes | maybe |                         yes |  no | `assignment:{clientCompanyId}:{userId}`          | assignment tables           | affected users             | Open/update on assignment change. Resolve on removal.                                                                 | unread on assignment/reassignment      | email for reassignment; otherwise in-app | medium      | "Your client assignment changed. Open Accountable for current access and work." |

### Data Ingestion And Sync

| Domain occurrence                  |   A |                   W |                         N |                      O | Attention key                    | Source of truth                        | Recipient resolver                                                              | Open/update/resolve                                                                                                            | Unread behavior           | Comms                             | Priority    | Staleness-safe copy                                                          |
| ---------------------------------- | --: | ------------------: | ------------------------: | ---------------------: | -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | --------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| Transactions imported/synced       | yes | yes, if work exists |    no direct notification |                     no | none directly                    | `bank_transactions`, work materializer | `firm_client_owner`                                                             | Activity records import/sync. Work materialization decides attention.                                                          | none directly             | off                               | low/medium  | n/a                                                                          |
| Bank account disconnected          | yes |               maybe |                       yes |                     no | `bank_connection:{credentialId}` | bank credentials/accounts              | `firm_client_owner`, maybe `firm_managers_for_client`, maybe client owner later | Open on disconnect/provider error. Update on repeated failures/status changes. Resolve on reconnect/successful sync.           | unread on open/escalation | immediate email                   | high        | "A bank connection needs attention. Open Accountable to reconnect it."       |
| Bank account reconnected           | yes |                  no |          resolve existing |                     no | `bank_connection:{credentialId}` | bank credentials/accounts              | prior notification recipients                                                   | Resolve reconnect attention. Optional activity only.                                                                           | no new unread by default  | off                               | low         | n/a                                                                          |
| Upload/import failed or partial    | yes |               maybe | yes if user action needed | maybe, if system fault | `import:{batchId}`               | import batch/result                    | actor, `firm_client_owner`                                                      | Open when import requires correction/retry. Update if retry changes status. Resolve on successful retry or explicit dismissal. | unread on open            | email if blocking or large impact | medium/high | "An import needs attention. Open Accountable for the current import status." |
| Duplicate/skipped rows need review | yes |                 yes |    yes if review required |                     no | `import_review:{batchId}`        | import batch/result                    | actor, `firm_client_owner`                                                      | Open when skipped/duplicate rows need user decision. Resolve when reviewed/accepted/ignored.                                   | unread on open            | in-app only by default            | medium      | "Some imported rows need review. Open Accountable for the latest details."   |

### Automation And Posting

| Domain occurrence                         |   A |     W |             N |   O | Attention key                                        | Source of truth                          | Recipient resolver    | Open/update/resolve                                                                                                      | Unread behavior                                           | Comms                  | Priority | Staleness-safe copy                                                  |
| ----------------------------------------- | --: | ----: | ------------: | --: | ---------------------------------------------------- | ---------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------- | -------- | -------------------------------------------------------------------- |
| Rules categorized transactions            | yes | maybe |            no |  no | none                                                 | rule logs, transaction state             | firm team             | Activity/audit only. Work layer handles residual review work.                                                            | none                                                      | off                    | low      | n/a                                                                  |
| AI autocategorized transactions           | yes | maybe |            no |  no | none                                                 | predictions/candidates/transaction state | firm team             | Activity/audit only. Work layer handles residual review work.                                                            | none                                                      | off                    | low      | n/a                                                                  |
| Autopost succeeded                        | yes |    no | no by default |  no | none or `autopost:{runId}` only for audit references | ledger/autopost run                      | firm team/admin       | Activity/audit only unless firm policy later requires review.                                                            | none                                                      | off; summary later     | low      | n/a                                                                  |
| Auto-categorized transactions need review | yes |   yes |           yes |  no | `work_item:{workItemId}:assignee:{userId}`           | work item and candidate state            | `assigned_work_owner` | Open when review work item is created/assigned. Update when count/type mix changes. Resolve when work closes/reassigned. | unread on open; update unread only on material escalation | in-app only by default | medium   | "Review work is ready. Open Accountable for the latest suggestions." |

### Journals

| Domain occurrence                    |   A |                           W |                                 N |   O | Attention key                      | Source of truth           | Recipient resolver                       | Open/update/resolve                                                       | Unread behavior            | Comms                  | Priority | Staleness-safe copy                                                           |
| ------------------------------------ | --: | --------------------------: | --------------------------------: | --: | ---------------------------------- | ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- | -------------------------- | ---------------------- | -------- | ----------------------------------------------------------------------------- |
| Draft recurring journals created     | yes | yes if review/post required | yes only if human action required |  no | `journal_review:{journalId}`       | journal rows/template run | assigned reviewer or `firm_client_owner` | Open when draft requires review/post. Resolve when posted/deleted/voided. | unread on open             | in-app only            | medium   | "A draft journal needs review. Open Accountable for current status."          |
| Draft recurring journal stale X days | yes |               existing work |                    yes escalation |  no | `journal_review:{journalId}:stale` | journal row age/status    | assigned reviewer, maybe manager         | Open/escalate when stale threshold crossed. Resolve when posted/deleted.  | unread on stale escalation | immediate email        | high     | "A draft journal still needs attention. Open Accountable for current status." |
| Recurring journal autoposted         | yes |                          no |                                no |  no | none                               | journal/autopost run      | firm team                                | Activity/audit only.                                                      | none                       | off; summary later     | low      | n/a                                                                           |
| Auto reversal journal posted         | yes |                          no |               no unless exception |  no | none                               | journal rows              | firm team                                | Activity/audit only unless reversal fails or needs review.                | none                       | off                    | low      | n/a                                                                           |
| Conversion journal created           | yes |      yes if review required |            yes only if actionable |  no | `journal_review:{journalId}`       | journal rows              | assigned reviewer                        | Open if review/post required. Resolve when posted/deleted.                | unread on open             | in-app only by default | medium   | "A conversion journal needs review. Open Accountable for current status."     |

### Operational Work

| Domain occurrence                    |     A |                             W |                            N |   O | Attention key                                                                                          | Source of truth                            | Recipient resolver      | Open/update/resolve                                                                                            | Unread behavior                                                       | Comms                                  | Priority    | Staleness-safe copy                                                     |
| ------------------------------------ | ----: | ----------------------------: | ---------------------------: | --: | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| Work assigned                        |   yes |        existing/new work item |                          yes |  no | `work_item:{workItemId}:assignee:{userId}`                                                             | `app.work_items`, `app.work_item_subjects` | `assigned_work_owner`   | Open when assigned work item opens. Update from current work state. Resolve when closed or reassigned away.    | unread on open                                                        | email by policy only; in-app immediate | medium      | "New work is assigned to you. Open Accountable for the latest details." |
| Work materially changed              | maybe |            existing work item | update existing notification |  no | `work_item:{workItemId}:assignee:{userId}`                                                             | work item/current subjects                 | `assigned_work_owner`   | Update when active count/type mix changes materially. Resolve with work item.                                  | unread only on material escalation                                    | no email by default                    | medium      | "Your assigned work changed. Open Accountable for the latest details."  |
| Work/client reassigned               |   yes | existing work item/assignment |                          yes |  no | old: `work_item:{workItemId}:assignee:{oldUserId}`; new: `work_item:{workItemId}:assignee:{newUserId}` | work assignment state                      | affected users          | Resolve old user's attention. Open new user's attention.                                                       | unread for new assignee and old assignee if removal should be noticed | email for reassignment                 | medium/high | "A work assignment changed. Open Accountable for current ownership."    |
| Multiple people temporarily assigned |   yes |             participant state |                          yes |  no | `work_item:{workItemId}:participant:{userId}`                                                          | work participants table/future state       | `work_participants`     | Open when participant added. Resolve when removed or work closes.                                              | unread on added/removed if user affected                              | in-app; chat later maybe               | medium      | "You were added to shared work. Open Accountable for current status."   |
| Work overdue                         |   yes |            existing work item |               yes escalation |  no | `work_item:{workItemId}:overdue:{userId}`                                                              | work due/escalation state                  | assignee, maybe manager | Open when overdue threshold crossed. Update with severity. Resolve when work completed/not overdue/reassigned. | unread on overdue/escalation                                          | immediate email                        | high        | "Assigned work needs attention. Open Accountable for current status."   |

Material escalation examples:

- Work becomes overdue.
- Assignee/participant changes.
- Severity changes from normal to high/critical.
- Count crosses a threshold configured for the work type.
- Previously resolved attention reopens.
- New required action appears where there was only informational state before.

### Approvals And Reviews

| Domain occurrence                  |   A |                      W |                 N |   O | Attention key                                   | Source of truth                | Recipient resolver                | Open/update/resolve                                                                                 | Unread behavior                       | Comms                                   | Priority    | Staleness-safe copy                                                        |
| ---------------------------------- | --: | ---------------------: | ----------------: | --: | ----------------------------------------------- | ------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| Close approval requested           | yes |    maybe approval task |               yes |  no | `close_approval:{closeRunId}:approver:{userId}` | close approval rows            | `close_approvers`                 | Open when approval requested. Resolve when approved/rejected/cancelled.                             | unread on open                        | immediate email                         | high        | "A close approval needs your review. Open Accountable for current status." |
| Close approval rejected            | yes |  maybe corrective work |               yes |  no | `close_rejection:{closeRunId}`                  | close decision rows            | `close_preparer`, maybe owner     | Open when rejected. Update on comments/resubmission. Resolve when addressed/resubmitted.            | unread on open/update with new action | immediate email                         | high        | "A close approval was rejected. Open Accountable for required next steps." |
| Client question/message/mention    | yes |             maybe task |               yes |  no | `client_query:{queryId}:recipient:{userId}`     | query/message rows             | responsible user/client recipient | Open on question/mention. Update on new reply if attention still needed. Resolve on response/close. | unread on open/new directed reply     | email/chat by urgency later; in-app now | medium/high | "A message needs attention. Open Accountable for the latest thread."       |
| Client uploads docs needing review | yes | yes if review required | yes if actionable |  no | `document_review:{fileId}`                      | files/attachments/review state | `firm_client_owner`               | Open when review needed. Resolve when reviewed/processed/attached.                                  | unread on open                        | in-app only by default                  | medium      | "A document needs review. Open Accountable for current status."            |

### Exceptions And Data Quality

| Domain occurrence                              |   A |                               W |               N |                      O | Attention key                                                  | Source of truth          | Recipient resolver                 | Open/update/resolve                                                                                               | Unread behavior           | Comms                                     | Priority    | Staleness-safe copy                                                            |
| ---------------------------------------------- | --: | ------------------------------: | --------------: | ---------------------: | -------------------------------------------------------------- | ------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| Known transaction/journal policy gap           | yes |                             yes |             yes |                     no | `data_quality:{clientCompanyId}:{policyKey}:{sourceId}`        | validation/policy result | `firm_client_owner`, maybe manager | Open when policy gap requires correction/waiver. Update if severity/count changes. Resolve when corrected/waived. | unread on open/escalation | email only if high severity               | medium/high | "A data quality issue needs review. Open Accountable for current details."     |
| Sync failure requires action                   | yes |                           maybe |             yes | maybe, if system fault | `sync_failure:{sourceId}`                                      | sync run/provider state  | `firm_client_owner`, firm admin    | Open on actionable failure. Update on repeated attempts/escalation. Resolve on successful sync.                   | unread on open/escalation | immediate email                           | high        | "A sync issue needs attention. Open Accountable for current status."           |
| Missing opening balance / bank-ledger mismatch | yes |               yes if actionable |             yes |                     no | `data_quality:{clientCompanyId}:balance_mismatch:{sourceId}`   | balance/ledger checks    | `firm_client_owner`                | Open when mismatch requires action. Resolve when corrected/accepted.                                              | unread on open/escalation | in-app; email if high impact              | medium/high | "A balance issue needs review. Open Accountable for current details."          |
| FX rate missing                                | yes | yes if blocks posting/reporting | yes if blocking |                     no | `data_quality:{clientCompanyId}:fx_rate_missing:{dateOrRunId}` | FX/rate lookup state     | `firm_client_owner`                | Open when missing rate blocks work. Resolve when rate provided/retried.                                           | unread on open            | in-app; email if blocking close/reporting | medium      | "An exchange-rate issue needs attention. Open Accountable for current status." |

### Close, Reporting, And Period Control

| Domain occurrence                            |   A |                         W |                                N |                               O | Attention key                                                                             | Source of truth          | Recipient resolver             | Open/update/resolve                                                                   | Unread behavior                           | Comms                     | Priority   | Staleness-safe copy                                                              |
| -------------------------------------------- | --: | ------------------------: | -------------------------------: | ------------------------------: | ----------------------------------------------------------------------------------------- | ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------- | ---------- | -------------------------------------------------------------------------------- |
| Close cycle begins                           | yes | yes if tasks are assigned | no broad notification by default |                              no | `close_cycle:{clientCompanyId}:{periodKey}` only if actionable                            | close cycle/run state    | close owner/team               | Activity plus generated work/approval rows. Avoid broad broadcast.                    | none by default                           | off by default            | low/medium | n/a                                                                              |
| Period closed                                | yes |                        no |            optional summary only |                              no | none                                                                                      | close/period state       | firm/client stakeholders maybe | Historical.                                                                           | none                                      | summary only              | low        | n/a                                                                              |
| Period locked                                | yes |                        no |            optional summary only |                              no | none                                                                                      | period lock state        | firm team                      | Historical unless someone needs access/action.                                        | none                                      | off/summary               | low        | n/a                                                                              |
| Period reopened / post-close change detected | yes |      yes if review needed |           yes if action required |                              no | `period_control:{clientCompanyId}:{periodKey}:reopened` or `post_close_change:{sourceId}` | close/period/audit state | close owner/team               | Open if review or correction required. Resolve when addressed.                        | unread on open                            | email if high impact      | high       | "A closed period needs review. Open Accountable for current details."            |
| Report ready                                 | yes |                        no |                            maybe |                              no | `report:{reportRunId}:recipient:{recipientId}`                                            | report run               | `report_recipient`             | Open if recipient-facing report is ready. Resolve optional on view/download.          | unread on open if treated as notification | email if recipient-facing | medium     | "A report is ready. Open Accountable for the latest version."                    |
| Report delivery failed                       | yes |          maybe retry work |                              yes | maybe, if provider/system fault | `report_delivery:{reportRunId}`                                                           | report delivery run      | report owner/admin             | Open on failed delivery. Update on retry status. Resolve on successful resend/cancel. | unread on open/escalation                 | immediate email           | high       | "Report delivery needs attention. Open Accountable for current delivery status." |

### Summaries, Account, Billing, And Security

| Domain occurrence              |                       A |   W |                                     N |                    O | Attention key                               | Source of truth             | Recipient resolver      | Open/update/resolve                                                              | Unread behavior                                      | Comms                              | Priority    | Staleness-safe copy                                                    |
| ------------------------------ | ----------------------: | --: | ------------------------------------: | -------------------: | ------------------------------------------- | --------------------------- | ----------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------- | ----------- | ---------------------------------------------------------------------- |
| Month/week/year in review      |                 summary |  no | summary surface, not active attention |                   no | `summary:{recipientId}:{period}`            | composed analytics/snapshot | user/client/firm admin  | Generated on schedule. Not resolved like active attention.                       | no unread unless product chooses "new summary" badge | email/in-app summary               | low         | "Your review is ready. Open Accountable for the latest summary."       |
| Billing/payment failed         |                     yes |  no |                                   yes |                   no | `billing:{billingAccountId}:payment_failed` | billing provider/account    | `billing_owner`         | Open on payment failure. Update on retry/escalation. Resolve on payment success. | unread on open/escalation                            | immediate email                    | high        | "Billing needs attention. Open Accountable for current status."        |
| Security/account change        | maybe security activity |  no |       usually no product notification | maybe, if suspicious | `user_account:{userId}:{changeType}`        | auth/account state          | `affected_user`         | Transactional security comms. Product feed only if useful.                       | usually none                                         | immediate transactional email      | high        | "Your account was changed. Open Accountable if this was not you."      |
| Support access granted/revoked |                     yes |  no |   maybe account/security notification | maybe, if suspicious | `support_access:{scopeId}:{userId}`         | support access rows         | affected account/admins | Open/log when access granted. Resolve when revoked/expired.                      | unread if user/admin should notice                   | email for security-sensitive cases | medium/high | "Support access changed. Open Accountable for current access details." |

## Lifecycle Rules

- Create a notification when attention opens.
- Update the notification when current attention state changes.
- Mark unread again only when the update materially changes user action,
  urgency, recipient ownership, or severity.
- Resolve the notification when the source attention is no longer active.
- External comms fire only on selected transitions:
  - opened,
  - escalated,
  - reassigned,
  - overdue,
  - failed,
  - security/billing critical transition.
- External comms copy must link to live app state and avoid stale authoritative
  counts unless the timestamp/context is explicit.

## Implementation Implications

Before adding more event types, the notification implementation should support:

1. `attention_key`
   - Unique active attention per recipient and key.
   - Used for upsert/update instead of raw event-only inserts.

2. `resolved_at`
   - Used to remove active attention from current feed/counts or visually mark
     resolved rows.

3. Update semantics
   - Work and review notifications should be refreshable from source state.
   - Routine count changes should not automatically send external comms.

4. External comms transition policy
   - Comms is triggered by selected lifecycle transitions, not every
     notification update.
   - Product policy decides whether external delivery is allowed.
   - User/firm preferences and channel availability decide concrete routes.

5. Registry defaults
   - Stop defaulting all company attention to immediate email.
   - In-app should be the default for active attention.
   - Email should be reserved for critical, blocking, approval, overdue,
     reassignment, billing/security, and re-engagement cases.

6. Activity separation
   - Automation successes, imports, postings, period changes, and audit events
     should remain activity-only unless they create human attention.

7. Preference model
   - Keep live code defaults for `(notification type, channel)`.
   - Keep user rows as overrides, not mandatory materialized defaults.
   - Continue exposing only implemented/supported channels in the preferences
     API.
   - Add chat/SMS/WhatsApp preferences only when those channels have route
     resolvers and providers.

8. Channel route registry
   - Replace hardcoded email-only route resolution with a notification-side
     route resolver registry.
   - Implement only email initially.
   - Keep future channel entries unavailable/hidden until route resolution is
     real.

## First Implementation Candidates

Use these rows to validate the lifecycle model before adding digest/chat:

1. Work assigned / work materially changed / work overdue.
2. Bank account disconnected / reconnected.
3. Sync failure requires action.
4. Close approval requested / rejected.
5. Report delivery failed.

Digest, chat, firm-level routing, and AI-composed summaries should come after
active attention lifecycle behavior is correct.

Preference implementation itself is not a blocker for Phase 1 because the basic
per-user preference API already exists. Phase 1 should refine how preferences
are applied inside delivery planning and make sure the registry defaults reflect
the matrix rather than blanket immediate email.
