# Accountable Books Admin App v1 Scope

Status: Internal working doc
Last updated: March 28, 2026
Owner: Temi / Product / Engineering

## 1. Purpose

This document defines what the v1 admin app should actually be.

It is a practical follow-up to:

- `my-notes/product/evaluation-system-blueprint.md`
- `my-notes/product/admin-app-blueprint.md`

Those documents describe the ideal system.
This document defines the first real version we should build given the current
state of the product.

The main question here is:

- what is the smallest admin app that gives us real operational leverage now?

## 2. Current Product Reality

We need to be honest about where the product is today.

Current realities:

- workflow and task infrastructure is becoming real
- much of the main product UX is still incomplete or mock-backed
- advanced analytics does not exist yet
- firm and client dashboards are not yet fully real
- client management and reporting are still incomplete
- AI instrumentation is partially present, but feedback capture is not mature

Because of that, v1 admin app should not try to do everything in the ideal
blueprint.

v1 should prioritize:

- operational visibility
- support investigation
- workflow truth
- narrow but meaningful evaluations

v1 should not prioritize:

- a broad internal backoffice
- a heavy experimentation suite
- full AI quality science
- deep billing or entitlement tooling

## 3. What v1 Is For

The v1 admin app should help the team do four things well:

1. See which firms and client-periods are unhealthy
2. Understand why a workflow is blocked or delayed
3. Support users without raw database digging
4. Track the first meaningful product, workflow, AI, and business metrics

If v1 does those four things well, it will already be valuable.

## 4. v1 Product Thesis

The v1 admin app should be an internal operations and support console with a
lightweight insights layer.

That means:

- Ops first
- Support second
- Insights third
- Controls and Audit only where clearly necessary

This is the right sequencing because the product still needs strong operational
clarity before it needs a full internal control platform.

## 5. v1 Modules

v1 should ship only five modules.

### 5.1 Command Center

This is the v1 home page.

Purpose:

- show what needs attention now

Must have:

- active firms count
- active client books count
- open workflow runs count
- overdue workflow runs count
- hard-blocked task count
- disconnected bank count
- top stuck client-periods
- recent alerts or incidents

Should answer:

- what looks unhealthy right now?
- which firms or client-periods need attention first?

### 5.2 Firm Ops

Purpose:

- operational view of one firm's client books

Must have:

- firm summary
- client list with current health status
- client-period list with workflow stage
- open task counts by client
- blocker counts by client
- assignee filter
- unhealthy-only filter

Should answer:

- how is this firm doing overall?
- which clients are slipping?
- who is overloaded?

### 5.3 Client-Period Inspector

Purpose:

- deep inspection of a single client-period

This is the most important v1 screen after the homepage.

Must have:

- workflow run header
- stage and milestone timestamps
- open tasks
- blocker list with age and severity
- task event timeline
- bank health status
- uncategorized transaction count if available
- draft journal count if available
- assignment and due date context

Should answer:

- why is this period blocked or delayed?
- what needs to happen next?
- what changed recently?

### 5.4 Support Console

Purpose:

- enable basic support and investigation without engineering intervention

Must have:

- search for firm, client, user, workflow run, task
- entity summary panel
- recent activity timeline
- linked workflow/task visibility
- linked bank state visibility
- linked AI run visibility if applicable
- support notes or internal notes

Safe actions allowed in v1:

- add internal note
- copy investigation link
- enqueue safe retry for supported jobs
- resend invitation or notification if flow exists

### 5.5 Insights

Purpose:

- expose a narrow set of useful v1 evaluations

This is not a giant BI area in v1.
It should be a small set of trustworthy dashboards built on stable facts.

Must have:

- workflow health dashboard
- business health dashboard
- early product health dashboard
- very limited AI quality dashboard

## 6. v1 Modules To Defer

These are important, but should not be part of v1 unless something changes.

Defer:

- full controls center
- feature flag registry UI unless rollout complexity demands it immediately
- billing and entitlement operations
- full audit explorer
- experiment management
- advanced AI calibration tooling
- compliance-specific workflows

These can come in v1.1 or v2.

## 7. The v1 Evals To Include

The right question is not "what evals exist in theory?"
The right question is "which evals are trustworthy and actionable enough to put
in front of internal users in v1?"

v1 should include metrics in four categories, but with narrow scope.

### 7.1 Product health evals in v1

Include only the ones we can instrument and use soon.

Recommended v1 product metrics:

- time to first useful action
- dashboard-to-action rate
- dead-end session rate
- workbench deep-link rate

Do not include in v1:

- advanced funneling across incomplete surfaces
- rich financial drill metrics until financials are more real
- client response latency tied to client query systems that do not yet exist

### 7.2 Workflow health evals in v1

This should be the strongest evaluation category in v1.

Recommended v1 workflow metrics:

- open workflow runs
- overdue workflow runs
- workflow stage distribution
- median close time
- task backlog by type
- hard-blocked task rate
- warning-blocked task rate
- blocker incidence by code
- blocker duration
- review cycle count

Why:

- these can be grounded in the current workflow/task system
- these are directly useful to ops and support

### 7.3 AI quality evals in v1

Keep this narrow and honest.

Recommended v1 AI metrics:

- AI run volume
- AI run success rate
- AI token usage
- AI cost
- AI cost per active workflow run

Only include acceptance and override metrics in v1 if:

- the feedback capture is real and canonical

If not, do not fake it.

Defer:

- confidence calibration
- precision-at-k
- robust override analytics

until `categorization_feedback_events` or equivalent becomes real.

### 7.4 Business health evals in v1

Recommended v1 business metrics:

- active firms
- active client books
- closed periods per firm
- signup to first closed month
- 30-day active firm retention

Only include signup to first bank link if:

- bank-link event capture is real and trustworthy

## 8. v1 Evals To Exclude

This matters just as much as what we include.

Do not include these in v1 dashboards:

- `open_client_queries` metrics
- client-friction metrics built on stub systems
- fake firm health scores with weak definitions
- AI acceptance metrics inferred from indirect behavior
- product adoption funnels across incomplete app surfaces
- deep revenue/billing analytics unless billing systems are actually operational

Rule:

- if the source of truth is incomplete, the metric should not be in the v1 admin app

## 9. v1 Dashboard Set

v1 should ship four dashboards inside the Insights module.

### 9.1 Workflow Health Dashboard

Audience:

- ops
- founder
- support leads

Include:

- open workflow runs
- overdue workflow runs
- stage distribution
- median close time trend
- backlog by task type
- blocker incidence by code
- blocker age distribution
- top stuck client-periods

This is the highest-priority dashboard in v1.

### 9.2 Business Health Dashboard

Audience:

- founder
- leadership

Include:

- active firms
- active client books
- closed periods trend
- active workflow runs trend
- first-close attainment
- 30-day active retention

This should stay simple in v1.

### 9.3 Product Health Dashboard

Audience:

- product
- founder

Include:

- time to first useful action
- dashboard-to-action rate
- dead-end session rate
- workbench deep-link rate

Only ship this after basic `product_events` instrumentation exists.

### 9.4 AI Usage Dashboard

Audience:

- product
- ML
- founder

Include:

- AI run volume
- AI success rate
- token trend
- cost trend
- cost by tenant

Do not position this as a full AI quality dashboard yet if feedback capture is missing.

## 10. Core Screens In v1

If I were defining the actual screen list, it would be:

1. Command Center
2. Firm List
3. Firm Detail / Firm Ops
4. Client-Period Inspector
5. Support Search
6. Support Entity Detail
7. Workflow Health Dashboard
8. Business Health Dashboard
9. Product Health Dashboard
10. AI Usage Dashboard

That is enough for a real v1.

## 11. v1 Internal Personas And Their Primary Screens

### Founder

Primary screens:

- Command Center
- Business Health Dashboard
- Workflow Health Dashboard

### Ops lead

Primary screens:

- Command Center
- Firm Ops
- Client-Period Inspector

### Support

Primary screens:

- Support Search
- Support Entity Detail
- Client-Period Inspector

### Product

Primary screens:

- Product Health Dashboard
- Workflow Health Dashboard

### ML / AI

Primary screens:

- AI Usage Dashboard
- Client-Period Inspector when needed

## 12. v1 Data Sources

v1 should rely on these existing or near-term sources:

- `workflow_runs`
- `engagement_tasks`
- `engagement_task_blockers`
- `engagement_task_events`
- `ai_chat_runs`
- audit event tables
- basic `product_events` once added

v1 should derive:

- `eval_workflow_run_facts`
- `eval_task_facts`
- `eval_blocker_facts`
- `eval_ai_usage_facts`
- `eval_client_period_scorecards`
- `eval_firm_daily_snapshots`

Optional in late v1:

- `eval_session_facts`

## 13. v1 Data Collection Requirements

To support the v1 admin app properly, we need a minimum event and fact setup.

### 13.1 Required operational truth

Already mostly available or close:

- workflow run state
- task state
- blocker state
- task event timeline
- AI run telemetry

### 13.2 Required new instrumentation

Minimum required:

- `product_events`
- session id support
- dashboard view event
- workbench view event
- task open event
- useful action event model

Without that, Product Health Dashboard should not ship.

### 13.3 Required derived facts

Must build:

- workflow run facts
- task facts
- blocker facts
- firm daily snapshot
- client-period scorecard

## 14. Safe Actions Allowed In v1

v1 should include only low-risk and moderate-risk internal actions.

Allowed:

- add internal note
- acknowledge alert
- assign or reassign owner
- copy investigation link
- filter and inspect
- enqueue safe retry for supported jobs
- resend invite or notification where flow exists

Not allowed in v1 unless strictly necessary and fully audited:

- raw data mutation
- direct ledger edits
- silent workflow state overrides
- uncontrolled tenant-level config changes
- force-closing or force-reopening accounting states from a casual UI

## 15. Permission Model For v1

v1 internal roles should be simple.

Suggested roles:

- `founder_admin`
- `ops_admin`
- `support_agent`
- `product_analyst`
- `ml_analyst`

Permissions:

- `founder_admin`
  - full read across all v1 modules
  - limited safe actions
- `ops_admin`
  - full workflow and support inspection
  - assignment and retry actions
- `support_agent`
  - search and inspect
  - notes and safe support actions
  - no broad operational controls
- `product_analyst`
  - read-only insights
- `ml_analyst`
  - read-only AI usage and workflow inspection

## 16. Recommended v1 Rollout Order

### Phase 1

- workflow facts
- task facts
- blocker facts
- client-period scorecard
- Command Center
- Firm Ops
- Client-Period Inspector

This gives immediate ops value.

### Phase 2

- Support Search
- Support Entity Detail
- Business Health Dashboard
- Workflow Health Dashboard

This gives support and leadership utility.

### Phase 3

- `product_events`
- Product Health Dashboard
- AI Usage Dashboard

This gives the first real product and AI visibility.

## 17. v1 Success Criteria

The v1 admin app is successful when:

- ops can identify the top stuck client-periods quickly
- support can investigate common issues without raw queries
- leadership can see platform health at a glance
- workflow health is visible and trustworthy
- business health is visible at a basic but reliable level
- product health is visible only where instrumentation is real

## 18. The Main Risk In v1

The biggest risk is pretending the data is more mature than it is.

The failure mode would be:

- polished dashboards
- weak definitions
- incomplete event capture
- fake health scores
- misleading AI quality claims

So the rule for v1 should be:

- fewer metrics
- stronger truth
- more operational usefulness

## 19. Recommended Naming

Suggested internal name:

- `Admin App v1: Ops + Support + Core Insights`

That name is useful because it keeps the scope grounded.

## 20. Next Documents To Create After This

After this scope note, the next useful docs would be:

1. `my-notes/product/admin-app-v1-screen-map.md`
2. `my-notes/product/admin-app-v1-api-and-data-contract.md`
3. `my-notes/product/admin-app-v1-ticket-breakdown.md`

Those three would convert the scope into implementation.
