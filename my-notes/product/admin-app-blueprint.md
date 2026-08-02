# Accountable Books Admin App Blueprint

Status: Internal working doc
Last updated: March 28, 2026
Owner: Temi / Product / Engineering

## 1. Why The Admin App Exists

The admin app for Accountable Books should not be treated as a miscellaneous
internal tool.

It should be the internal control plane for running the company-side of the
product.

Its job is to help internal teams:

- understand what is happening across firms, clients, and periods
- detect operational risk early
- support users without guessing
- monitor AI quality and workflow quality
- control platform behavior safely
- inspect audit history and sensitive operational events

This means the admin app is broader than:

- analytics only
- support tooling only
- user management only

It should combine ops, support, insights, controls, and trust into one coherent
internal system.

## 2. What The Admin App Is

The ideal admin app is an internal operations console built around the product's
real operating hierarchy:

- platform
- accounting firm
- client company
- accounting period
- workflow run
- task
- blocker
- source evidence

That hierarchy matters because most internal problems will begin at one level
and need to be traced into lower levels.

Examples:

- "This firm looks unhealthy"
- "Why is this client not closing?"
- "Why is AI override rate spiking for this tenant?"
- "Why is support hearing repeated complaints about missing progress?"

The admin app should let the team move from high-level signal to specific cause
without leaving the app.

## 3. What The Admin App Is Not

It should not be:

- a duplicate of the customer-facing app
- a raw database editor
- a place for dangerous ad hoc fixes without audit trail
- a collection of disconnected dashboards
- a temporary support console that accidentally becomes the company's backbone

## 4. Core Jobs To Be Done

The ideal admin app should help internal teams do five jobs well.

### 4.1 See risk early

Questions:

- Which firms are slipping?
- Which client-periods are stuck?
- Which blockers are increasing?
- Where is the operational queue becoming unhealthy?

### 4.2 Investigate specific issues

Questions:

- What happened for this firm, client, user, workflow, or task?
- What did the user likely see?
- What failed?
- What changed recently?

### 4.3 Take safe internal actions

Questions:

- Can an internal operator retry a job?
- Can a support agent trigger a bank reconnect reminder?
- Can an ops lead reassign a stuck workflow?
- Can a privileged admin roll out or disable a feature for a tenant?

### 4.4 Measure product and AI quality

Questions:

- Are users finding the right next action?
- Are workflows progressing faster?
- Is AI helping or increasing downstream review?
- Which features improve retention and operational throughput?

### 4.5 Preserve trust and auditability

Questions:

- Who changed what?
- When was a period approved, sent, or closed?
- What manual override happened?
- Which internal action affected a customer-facing workflow?

## 5. Who The Admin App Serves

The admin app is for internal personas, not customers.

### 5.1 Founder / leadership

Needs:

- command center
- business health
- operational risk overview
- AI cost and value overview

### 5.2 Operations

Needs:

- firm-level workflow visibility
- queue balancing
- overdue close detection
- blocker triage
- unhealthy client-period identification

### 5.3 Support

Needs:

- search and inspection
- user and tenant history
- likely root-cause visibility
- safe support actions
- audit-friendly timelines

### 5.4 Product and design

Needs:

- product health signals
- discoverability and workflow progression signals
- qualitative issue patterns
- feature rollout observation

### 5.5 Engineering

Needs:

- integration health
- event integrity
- worker/job visibility
- system failure patterns
- environment and rollout controls

### 5.6 ML / AI

Needs:

- AI usage
- AI cost
- acceptance and override trends
- confidence calibration
- by-model and by-tenant monitoring

### 5.7 Finance / trust / compliance later

Needs:

- audit trails
- period close/reopen history
- sensitive override review
- suspicious pattern inspection

## 6. The Five Pillars Of The Admin App

For this product, the ideal admin app should be organized around five pillars:

- Ops
- Support
- Insights
- Controls
- Audit

This is the correct mental model for Accountable Books.

## 7. Ideal Information Architecture

The app should be organized around these top-level modules.

### 7.1 Command Center

Purpose:

- one place to see overall platform health and what needs attention now

This is the homepage.

It should show:

- active firms
- unhealthy firms
- overdue client-periods
- hard-blocked task rate
- disconnected bank spikes
- AI anomaly alerts
- support queue summary
- recent critical incidents

This page should answer:

- what is wrong right now?
- what needs attention first?
- is the platform healthier or worse than last week?

### 7.2 Firm Ops

Purpose:

- operational view of one firm and its client books

It should show:

- all clients for a firm
- client-period health
- current workflow stage per client-period
- open tasks by type
- blocker summary
- assignee load
- overdue items
- recent workflow events

It should support:

- filtering by assignee
- filtering by status
- filtering by unhealthy clients only
- drilling into a client-period inspector

This page is where ops teams manage book progress.

### 7.3 Client-Period Inspector

Purpose:

- deep inspection of a single client-period

This is one of the most important screens in the whole admin app.

It should show:

- workflow run status
- milestone timestamps
- stage durations
- assigned owner
- open tasks
- blocker history
- task event timeline
- bank connection health
- uncategorized transaction load
- draft journal load
- report sent / close history
- audit trail

It should answer:

- why is this period healthy, blocked, or delayed?
- what changed most recently?
- what specific action should happen next?

### 7.4 Support Console

Purpose:

- find and investigate user, firm, client, or workflow issues quickly

Search should work by:

- user id
- email
- firm name
- client company name
- workflow run id
- task id
- bank account id
- transaction id
- AI run id

It should show:

- core profile and account state
- current access and company context
- recent activity timeline
- recent errors or anomalies
- linked workflows and tasks
- linked AI runs
- linked bank connection state

It should support safe actions like:

- resend invitation or notification
- refresh sync status
- enqueue safe retry
- create internal note
- escalate to engineering or ops

### 7.5 Insights

Purpose:

- formal evaluation and scorecard surfaces

This area should expose the four evaluation categories:

- product health
- workflow health
- AI quality
- business health

This module should be built directly on the evaluation system blueprint and
derived fact tables.

### 7.6 Controls

Purpose:

- internal platform configuration and controlled operations

This should include:

- feature flags
- tenant allowlists
- rollout controls
- model version rollout controls
- integration/provider settings
- internal account state flags
- plan or entitlement metadata
- maintenance tools

This area should be tightly permissioned.

### 7.7 Audit And Trust

Purpose:

- make sensitive and business-critical actions reviewable

This should include:

- audit logs
- period approve/send/close history
- reopen events
- manual override history
- internal actions taken by staff
- ledger-affecting system actions
- suspicious activity review

This is especially important because the product is accounting software.

## 8. Recommended Navigation Model

Recommended top navigation:

- Command Center
- Firms
- Support
- Insights
- Controls
- Audit

Recommended entity drill path:

- Firm
- Client
- Period
- Workflow run
- Task
- Evidence / audit

The app should feel hierarchy-first, not chart-first.

## 9. Data Model Alignment

The admin app should align with the same operational truths as the main product
and the evaluation system.

Primary source tables:

- `workflow_runs`
- `engagement_tasks`
- `engagement_task_blockers`
- `engagement_task_events`
- `ai_chat_runs`
- audit event tables
- future `product_events`
- future `categorization_feedback_events`

Primary derived models the admin app should rely on:

- `eval_workflow_run_facts`
- `eval_task_facts`
- `eval_blocker_facts`
- `eval_session_facts`
- `eval_ai_usage_facts`
- `eval_client_period_scorecards`
- `eval_firm_daily_snapshots`

This matters because the admin app should not query raw transactional joins for
every screen. Important dashboards and summaries should read from stable fact
layers.

## 10. What Each Module Should Show

### 10.1 Command Center

Key cards:

- active firms
- active client books
- unhealthy firms
- overdue workflow runs
- hard-blocked tasks
- disconnected bank accounts
- AI override spike
- support escalations

Key lists:

- top stuck client-periods
- firms with worsening health
- recent critical incidents

Key actions:

- open firm ops
- open client-period inspector
- open support console
- acknowledge alert

### 10.2 Firm Ops

Key views:

- portfolio table
- assignee workload table
- close progress trend
- blocker heatmap
- client-period health list

Key actions:

- open client-period inspector
- filter by unhealthy only
- filter by assignee
- assign or reassign owner
- add internal note

### 10.3 Client-Period Inspector

Key views:

- workflow summary header
- milestone timeline
- open tasks list
- blocker list with age
- activity timeline
- bank state panel
- AI/categorization panel
- close history panel
- audit panel

Key actions:

- reassign workflow owner
- trigger safe retry
- create internal ops note
- open linked support context
- copy investigation link

### 10.4 Support Console

Key views:

- entity summary
- recent timeline
- linked workflows/tasks
- linked AI runs
- linked bank issues
- support notes

Key actions:

- resend invite
- trigger sync retry
- add note
- escalate
- mark incident linked

### 10.5 Insights

Key views:

- product health dashboard
- workflow health dashboard
- AI quality dashboard
- business health dashboard
- cohort and scorecard views later

### 10.6 Controls

Key views:

- feature flag registry
- rollout audiences
- integration/provider settings
- model routing and version controls
- internal account flags

Key actions:

- enable or disable feature
- roll out by firm or cohort
- pin model version for specific tenants
- pause risky functionality if needed

### 10.7 Audit And Trust

Key views:

- audit log explorer
- period lifecycle history
- internal action log
- manual override review
- sensitive event search

## 11. Safe Actions Model

The admin app should not encourage dangerous intervention.

Actions should be grouped into three levels.

### 11.1 Inspect

Low risk.

Examples:

- view timelines
- view audit logs
- inspect workflow state
- inspect AI run history

### 11.2 Operational assist

Moderate risk, but acceptable with permissions and audit.

Examples:

- retry job
- resend notification
- refresh integration state
- reassign owner
- add internal note

### 11.3 High-trust controls

High risk. Must be tightly permissioned and audited.

Examples:

- override platform setting
- force rollout change
- reopen sensitive workflow state
- trigger manual recovery operations
- bypass normal restrictions

Rule:

- every non-read action in the admin app should produce an audit event

## 12. Permission Model

The admin app should support internal roles such as:

- founder_admin
- ops_admin
- support_agent
- product_analyst
- engineer_admin
- ml_admin
- audit_reviewer

Example permissions:

- support_agent
  - inspect users, firms, clients, workflows
  - add notes
  - trigger safe retries
  - no platform-wide controls
- ops_admin
  - full workflow and queue ops
  - reassignment controls
  - alert acknowledgment
- product_analyst
  - read insights and scorecards
  - no mutating actions
- engineer_admin
  - platform and integration controls
  - incident tooling
- audit_reviewer
  - audit and sensitive event access

Permissions should be explicit. Internal superuser shortcuts should be minimized.

## 13. Relationship To The Evaluation System

The admin app is not separate from the evaluation system. It is one of the main
consumers of it.

Relationship:

- evaluation system defines the source-of-truth metrics and facts
- admin app exposes those metrics as operational, support, and insight surfaces
- admin app also provides the human workflows for acting on those signals

Put simply:

- the evaluation system tells us what is happening
- the admin app helps us inspect it and act on it

## 14. Relationship To Customer-Facing Product

The admin app should mirror the core operating model of the product, but not copy
the customer UI.

Customer app focus:

- do the bookkeeping work
- review, close, and report
- support client and firm roles

Admin app focus:

- observe health
- investigate issues
- support users
- control rollout and risk
- audit sensitive actions

The customer product and the admin app should share identifiers, workflow truth,
and event models.

## 15. Ideal V1 Scope

The full ideal app is broad, but v1 should focus on the highest-leverage parts.

Recommended v1 modules:

1. Command Center
2. Firm Ops
3. Client-Period Inspector
4. Support Console
5. Insights

Defer deeper Controls and Audit expansion slightly if needed, but keep the data
model ready for them.

## 16. Recommended Build Order

### Phase 1

- Command Center
- Firm Ops
- Client-Period Inspector

Why:

- highest operational leverage
- directly tied to workflow health

### Phase 2

- Support Console
- basic Insights module

Why:

- helps support and product teams operate with real context

### Phase 3

- AI Quality views
- deeper Controls
- deeper Audit and Trust views

Why:

- depends on stronger event and feedback instrumentation

## 17. Screens I Would Definitely Expect

At minimum, the ideal admin app should eventually include:

- platform command center
- firm detail page
- client detail page
- client-period inspector
- workflow run detail page
- task detail page
- support search page
- user detail page
- AI quality dashboard
- business health dashboard
- feature flag and rollout page
- audit explorer

## 18. What Makes The Admin App Good

A good admin app for this product should:

- start from signal, then allow deep drill
- connect platform health to workflow health
- show the reason behind unhealthy states
- let internal teams act safely
- leave a reliable audit trail
- use stable source-of-truth data
- support both triage and structured investigation

## 19. Failure Modes To Avoid

Avoid these:

- building only dashboards and calling it an admin app
- building only support tooling and calling it an admin app
- allowing unaudited internal mutations
- relying on raw DB joins instead of fact tables for important screens
- exposing too many dangerous controls too early
- making entity search weak or fragmented
- separating operational signals from the actions needed to resolve them

## 20. Definition Of Success

The admin app is successful when:

- leadership can see where the platform is healthy or unhealthy
- ops can identify and act on stuck client-periods quickly
- support can investigate issues without asking engineering for raw queries
- product can observe whether user experience changes improve real workflow outcomes
- ML can observe whether model behavior is genuinely helpful
- every sensitive internal action is visible and auditable

At that point, the admin app becomes one of the company's most important internal
systems, not just a side tool.
