# Accountable Books Evaluation System Blueprint

Status: Internal working doc
Last updated: March 28, 2026
Owner: Temi / Product / Engineering

## 1. Why This Exists

Accountable Books should not have a generic analytics setup.

The product is not a content app, a simple SaaS admin tool, or a pure AI demo.
It is an operating system for bookkeeping and reporting. That means the
evaluation system must tell us:

- whether users can understand what to do next
- whether the bookkeeping workflow is progressing
- whether AI is actually reducing work
- whether the business is becoming healthier as firms adopt and retain

If the evaluation system is designed well, we should be able to answer:

- Are firms closing faster?
- What is stopping them from closing?
- Which surfaces reduce confusion and increase action?
- Is AI helping enough to justify its cost and risk?
- Which firms are likely to retain, expand, or churn?

This document describes the ideal evaluation system for the product:

- what we measure
- what tables we need
- how we collect the data
- how derived models should be shaped
- which dashboards and alerts matter
- how to implement this in phases

## 2. The Four Evaluation Categories

### 2.1 Product health

This answers:

- Can users use the product?
- Do they know what to do next?
- Do the dashboard, workbench, close, and financials surfaces reduce confusion?

Typical metrics:

- time to first useful action
- dashboard-to-action conversion
- workbench deep-link rate
- financial drill usage
- dead-end session rate

### 2.2 Workflow health

This answers:

- Can users complete the bookkeeping job?
- Where does work get stuck?
- Which blockers delay the month close?

Typical metrics:

- median close time
- workflow stage conversion
- task backlog
- blocker rate
- blocker duration
- overdue client-periods

### 2.3 AI quality

This answers:

- Is AI reducing labor?
- Is it trustworthy?
- Is it helping or just pushing work downstream into review?

Typical metrics:

- suggestion acceptance rate
- suggestion override rate
- confidence calibration
- human touches per 100 transactions
- AI success rate
- AI cost per closed period

### 2.4 Business health

This answers:

- Is the company growing in a healthy way?
- Are firms reaching value fast enough?
- Are they retaining and expanding?

Typical metrics:

- active firms
- active client books
- closed periods per firm
- signup to first bank link
- signup to first closed month
- retention by cohort

## 3. Core Design Principle

The primary unit of analysis should be:

- one `workflow_run`

Meaning:

- one client company
- one accounting period
- one workflow domain

For v1, the main domain is bookkeeping.

This is the correct center of gravity because the product promise is not
"generate page views" or "use AI often." The promise is:

- ingest data
- classify transactions
- adjust records
- review
- close
- report

Everything in the evaluation system should connect back to progress through that
client-period workflow.

Supporting units:

- `engagement_task`
- `engagement_task_blocker`
- `engagement_task_event`
- `user_session`
- `product_event`
- `ai_chat_run`
- `categorization_feedback_event`

## 4. Source Of Truth Hierarchy

Not all data sources should be treated equally.

### 4.1 DB-truth sources

These are authoritative for operations and business outcomes:

- `workflow_runs`
- `engagement_tasks`
- `engagement_task_blockers`
- `engagement_task_events`
- audit events
- `ai_chat_runs`

If these say a workflow is blocked or closed, that is the truth.

### 4.2 Interaction-truth sources

These are authoritative for UX and discoverability:

- frontend product events
- API-side event writes for user-triggered actions
- session-level behavior

These tell us what the user saw, clicked, opened, or ignored.

### 4.3 Rule

If DB-truth and clickstream disagree:

- operational dashboards should trust DB-truth
- experience dashboards should trust interaction-truth

## 5. What Already Exists In The Repo

Strong existing foundations:

- `workflow_runs`
  - per client-period lifecycle and milestone timestamps
- `engagement_tasks`
  - task inventory, assignment, priority, resolution
- `engagement_task_blockers`
  - blocker type, severity, code, resolution time
- `engagement_task_events`
  - task event history
- `ai_chat_runs`
  - model, provider, token usage, cost, outcome
- audit event writing

Current gaps:

- the main web app does not have a canonical product event stream
- tracking constants are still minimal
- client-friction signals like `open_client_queries` are still stubbed
- categorization feedback is not normalized into an analytics-friendly table

So the ideal system should build on the workflow/task spine that already exists,
not replace it.

## 6. Ideal Evaluation Architecture

The ideal system has six layers.

### 6.1 Layer 1: source systems

These are the raw operational systems:

- API database tables
- worker-generated workflow state
- AI usage tables
- frontend interaction emitters

### 6.2 Layer 2: canonical event capture

This is the normalized append-only event stream for product and system activity.

New ideal tables:

- `product_events`
- `categorization_feedback_events`

These are not substitutes for workflow tables. They complement them.

### 6.3 Layer 3: derived facts

These are analytics-friendly facts built from operational data.

New ideal tables or materialized views:

- `eval_workflow_run_facts`
- `eval_task_facts`
- `eval_blocker_facts`
- `eval_product_event_facts`
- `eval_ai_usage_facts`
- `eval_session_facts`
- `eval_client_period_scorecards`
- `eval_firm_daily_snapshots`

### 6.4 Layer 4: metric definitions

This layer turns facts into stable business definitions.

Optional but recommended metadata table:

- `metric_definitions`

This prevents teams from redefining metrics ad hoc.

### 6.5 Layer 5: dashboards and alerts

This is where teams consume the system:

- operations dashboard
- client friction dashboard
- AI quality dashboard
- business dashboard
- Slack or email alerts

### 6.6 Layer 6: experiments and decisions

This is the final layer:

- product experiments
- operational interventions
- AI model changes
- customer success prioritization

The purpose of the whole stack is decision-making, not reporting for its own sake.

## 7. Ideal Canonical Tables

Below is the ideal table set for the evaluation system.

### 7.1 `product_events`

Purpose:

- canonical event stream for user and system interaction across dashboard,
  workbench, close, financials, banking, AI, and onboarding

Recommended columns:

| Column              | Type          | Notes                                                                                |
| ------------------- | ------------- | ------------------------------------------------------------------------------------ |
| `id`                | uuid          | primary key                                                                          |
| `event_name`        | text          | dot-separated, e.g. `dashboard.viewed`                                               |
| `event_version`     | text          | schema version for payload                                                           |
| `occurred_at`       | timestamptz   | event time                                                                           |
| `actor_type`        | text          | `user`, `system`, `ai`                                                               |
| `user_id`           | uuid nullable | actor user if applicable                                                             |
| `firm_company_id`   | uuid nullable | accounting firm context                                                              |
| `client_company_id` | uuid nullable | client context                                                                       |
| `company_id`        | uuid nullable | current company context                                                              |
| `workflow_run_id`   | uuid nullable | if event is tied to a client-period                                                  |
| `task_id`           | uuid nullable | if event is tied to a task                                                           |
| `session_id`        | text nullable | client session                                                                       |
| `request_id`        | text nullable | backend trace/request join                                                           |
| `surface`           | text          | dashboard, workbench, close, financials, cat_engine, ai, banking, onboarding, system |
| `route`             | text nullable | canonical route or route key                                                         |
| `role_key`          | text nullable | admin, manager, staff, client_owner, etc.                                            |
| `country_code`      | text nullable | useful for bank/integration segmentation                                             |
| `metadata`          | jsonb         | event-specific payload                                                               |
| `created_at`        | timestamptz   | insert time                                                                          |

Rules:

- append-only
- never mutate event meaning in place
- version payloads if semantics change
- strip or avoid PII in metadata unless clearly justified

### 7.2 `categorization_feedback_events`

Purpose:

- canonical feedback stream for prediction quality

This is critical because AI quality cannot be judged from model outputs alone.

Recommended columns:

| Column                   | Type             | Notes                                                        |
| ------------------------ | ---------------- | ------------------------------------------------------------ |
| `id`                     | uuid             | primary key                                                  |
| `occurred_at`            | timestamptz      | event time                                                   |
| `user_id`                | uuid nullable    | reviewer or actor                                            |
| `firm_company_id`        | uuid nullable    | firm context                                                 |
| `client_company_id`      | uuid             | client context                                               |
| `bank_transaction_id`    | uuid nullable    | source transaction                                           |
| `categorization_task_id` | uuid nullable    | internal task if available                                   |
| `candidate_id`           | uuid nullable    | suggestion/candidate shown                                   |
| `model_name`             | text nullable    | model identifier                                             |
| `model_version`          | text nullable    | version at inference time                                    |
| `source_type`            | text             | `ml`, `rule`, `hybrid`, `manual_seeded`                      |
| `confidence_score`       | numeric nullable | normalized 0-1 if available                                  |
| `feedback_type`          | text             | `shown`, `accepted`, `edited`, `rejected`, `split`, `posted` |
| `edit_distance_score`    | numeric nullable | optional rough measure of how far final output differed      |
| `final_outcome`          | text nullable    | accepted-as-is, accepted-with-edit, rejected, superseded     |
| `metadata`               | jsonb            | explanation, account ids, counts, etc.                       |
| `created_at`             | timestamptz      | insert time                                                  |

Rules:

- every surfaced suggestion should emit `shown`
- final reviewer action should emit one of `accepted`, `edited`, `rejected`, or `split`
- link back to model version whenever possible

### 7.3 `metric_definitions`

Purpose:

- single registry of official metric meanings

Recommended columns:

| Column            | Type          | Notes                                        |
| ----------------- | ------------- | -------------------------------------------- |
| `metric_key`      | text pk       | stable id, e.g. `median_close_time_hours`    |
| `name`            | text          | display name                                 |
| `category`        | text          | product, workflow, ai, business              |
| `owner_team`      | text          | accountable team                             |
| `definition`      | text          | business definition                          |
| `grain`           | text          | run, task, session, day, firm, client-period |
| `numerator_sql`   | text nullable | optional implementation note                 |
| `denominator_sql` | text nullable | optional implementation note                 |
| `dimensions`      | jsonb         | supported segments                           |
| `status`          | text          | draft, active, deprecated                    |
| `created_at`      | timestamptz   | registry time                                |
| `updated_at`      | timestamptz   | last update                                  |

This can start as documentation and later become a real metadata table.

### 7.4 `alert_rules`

Purpose:

- configurable alert logic for operational thresholds

Recommended columns:

| Column             | Type    | Notes                            |
| ------------------ | ------- | -------------------------------- |
| `id`               | uuid    | primary key                      |
| `rule_key`         | text    | stable key                       |
| `name`             | text    | display name                     |
| `scope_type`       | text    | firm, client, workflow_run, task |
| `metric_key`       | text    | linked metric                    |
| `condition_type`   | text    | threshold, delta, ratio          |
| `threshold_value`  | numeric | trigger boundary                 |
| `window_size`      | text    | e.g. `24h`, `7d`                 |
| `severity`         | text    | info, warning, critical          |
| `delivery_channel` | text    | slack, email, in-app             |
| `is_active`        | boolean | enable/disable                   |
| `metadata`         | jsonb   | routing context                  |

This is optional for the first implementation, but it is part of the ideal system.

## 8. Ideal Derived Tables

These are the analytics workhorses.

### 8.1 `eval_workflow_run_facts`

Purpose:

- one analytics row per workflow run

Key columns:

- workflow identifiers
- firm/client dimensions
- assigned user
- due date
- milestone timestamps
- derived durations
- current status
- review cycle count
- closed flag
- overdue flag

Useful derived fields:

- `time_to_start_hours`
- `time_in_progress_hours`
- `time_to_review_request_hours`
- `time_under_review_hours`
- `time_to_close_hours`
- `is_closed`
- `is_overdue`
- `closed_without_send`

### 8.2 `eval_task_facts`

Purpose:

- one analytics row per task

Key columns:

- task identifiers
- linked workflow run
- task type and category
- assignee
- priority
- status
- due date
- resolved_at
- blocked flags
- task age
- completion duration

Useful derived fields:

- `task_open_age_hours`
- `task_completion_hours`
- `is_open`
- `is_blocked`
- `is_warning_only`
- `is_overdue`

### 8.3 `eval_blocker_facts`

Purpose:

- one analytics row per blocker occurrence

Key columns:

- blocker identifiers
- linked task and workflow run
- blocker type
- blocker code
- severity
- created_at
- resolved_at
- active flag

Useful derived fields:

- `blocker_duration_hours`
- `is_active`
- `is_client_side`
- `is_system_side`

### 8.4 `eval_product_event_facts`

Purpose:

- normalized interaction events for fast filtering and dashboarding

Key columns:

- event core fields
- standardized surface
- standardized route
- session dimensions
- role/company dimensions

Useful derived fields:

- `is_useful_action`
- `is_navigation_event`
- `is_drill_event`
- `is_export_event`

### 8.5 `eval_session_facts`

Purpose:

- one row per session

Key columns:

- session id
- user
- role
- firm/client/company
- session start and end
- number of events
- first surface
- first useful action time
- whether the session ended in meaningful action

Useful derived fields:

- `time_to_first_useful_action_seconds`
- `had_meaningful_action`
- `was_dead_end_session`

### 8.6 `eval_ai_usage_facts`

Purpose:

- one row per AI run or grouped AI interaction

Built from:

- `ai_chat_runs`
- future suggestion feedback joins

Useful derived fields:

- `run_success`
- `cost_usd`
- `cost_per_1k_tokens`
- `cost_per_active_workflow_run`

### 8.7 `eval_client_period_scorecards`

Purpose:

- one row per client-period with a concise health summary

Key fields:

- workflow run identifiers
- current stage
- open task count
- hard blocker count
- warning blocker count
- disconnected bank flag
- uncategorized transaction count
- draft journal count
- overdue flag
- days since last meaningful progress
- close probability or risk band in the future

This table is ideal for the firm dashboard and operations dashboard.

### 8.8 `eval_firm_daily_snapshots`

Purpose:

- one row per firm per day for business reporting

Key fields:

- active users
- active client books
- open workflow runs
- closed workflow runs
- median close time rolling value
- hard blocker rate
- AI cost
- AI acceptance rate
- retention status markers

## 9. Canonical Event Taxonomy

Event names should be stable, boring, and useful.

### 9.1 Dashboard and workbench

- `dashboard.viewed`
- `dashboard.client_selected`
- `dashboard.task_queue_item_opened`
- `dashboard.health_card_opened`
- `workbench.viewed`
- `workbench.queue_filter_applied`
- `workbench.quick_action_opened`

### 9.2 Workflow and tasks

- `workflow.viewed`
- `workflow.review_requested`
- `workflow.approved`
- `workflow.sent`
- `workflow.closed`
- `task.opened`
- `task.assigned`
- `task.completed`
- `task.blocker_viewed`
- `task.blocker_resolved`

### 9.3 Financials and drillability

- `financials.statement_viewed`
- `financials.line_drilled`
- `financials.account_drilled`
- `financials.source_opened`
- `financials.attachment_opened`
- `financials.exported`

### 9.4 Banking and onboarding

- `bank.connection_started`
- `bank.connection_succeeded`
- `bank.connection_failed`
- `bank.reconnect_started`
- `bank.reconnect_completed`
- `onboarding.started`
- `onboarding.company_created`
- `onboarding.bank_link_started`
- `onboarding.bank_link_succeeded`

### 9.5 AI and categorization

- `ai.chat_started`
- `ai.chat_completed`
- `ai.chat_failed`
- `categorization.suggestion_shown`
- `categorization.suggestion_accepted`
- `categorization.suggestion_edited`
- `categorization.suggestion_rejected`
- `categorization.transaction_posted`

## 10. How Data Should Be Collected

This is the most important practical section.

We should collect data in four ways.

### 10.1 From state transitions in the backend

Use this for:

- workflow lifecycle events
- task status changes
- blocker creation and resolution
- bank reconnect completion
- posting and close actions

Mechanism:

- write DB state first
- emit product/system event in the same transaction when feasible
- if same-transaction event writes are too risky, write state first and enqueue a
  durable event write job keyed by the state object id

Why:

- this gives authoritative event capture for critical actions

### 10.2 From frontend interaction emitters

Use this for:

- dashboard views
- workbench filter usage
- drill paths
- empty sessions
- time to first useful action

Mechanism:

- a small typed client analytics module
- sends events to an API endpoint that writes into `product_events`
- should include session id, route, surface, user, company context

Rules:

- fail silently from the UI
- batch when possible
- never block user flows on analytics

### 10.3 From workers and scheduled jobs

Use this for:

- task evaluation sweeps
- stale workflow alerts
- derived fact refreshes
- daily firm snapshots

Mechanism:

- worker writes audit and system events
- nightly or periodic refresh job builds fact tables

### 10.4 From model feedback capture

Use this for:

- categorization acceptance and override signals

Mechanism:

- when a suggestion is shown, log `shown`
- when a reviewer accepts without edits, log `accepted`
- when a reviewer modifies account, split, amount, or metadata, log `edited`
- when a reviewer discards the suggestion, log `rejected`
- when the transaction is finally posted, log `posted`

Why:

- this is the only credible way to evaluate model usefulness

## 11. Data Flow

The end-to-end flow should look like this:

1. User or system takes action.
2. Operational state is written to the DB.
3. Canonical event is written or enqueued.
4. Fact refresh jobs normalize source tables into evaluation facts.
5. Scorecards, dashboards, and alerts read from the fact layer.
6. Teams make decisions based on those stable definitions.

This prevents dashboard logic from querying raw transactional tables directly.

## 12. Metrics By Category

Below is the ideal KPI set.

### 12.1 Product health metrics

| Metric                          | Grain   | Source                                            | Formula                                                         |
| ------------------------------- | ------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Time to first useful action     | session | `eval_session_facts`                              | first useful action time - session start                        |
| Dashboard-to-action rate        | session | `eval_session_facts` + `eval_product_event_facts` | dashboard sessions with useful action / dashboard sessions      |
| Workbench deep-link rate        | session | `eval_product_event_facts`                        | workbench views leading to task/workflow open / workbench views |
| Financial drill completion rate | session | `eval_product_event_facts`                        | statement views reaching source drill / statement views         |
| Dead-end session rate           | session | `eval_session_facts`                              | sessions with no meaningful action / total sessions             |

### 12.2 Workflow health metrics

| Metric                 | Grain        | Source                    | Formula                         |
| ---------------------- | ------------ | ------------------------- | ------------------------------- |
| Median close time      | workflow run | `eval_workflow_run_facts` | median of close duration        |
| Stage conversion       | workflow run | `eval_workflow_run_facts` | progressed runs / eligible runs |
| Overdue run rate       | workflow run | `eval_workflow_run_facts` | overdue open runs / open runs   |
| Task backlog           | day or firm  | `eval_task_facts`         | count of open tasks             |
| Hard-blocked task rate | day or firm  | `eval_task_facts`         | blocked open tasks / open tasks |
| Mean blocker duration  | blocker      | `eval_blocker_facts`      | avg resolved duration           |

### 12.3 AI quality metrics

| Metric                      | Grain             | Source                           | Formula                                   |
| --------------------------- | ----------------- | -------------------------------- | ----------------------------------------- |
| AI run success rate         | ai run            | `eval_ai_usage_facts`            | successful runs / total runs              |
| Suggestion acceptance rate  | suggestion        | `categorization_feedback_events` | accepted / shown                          |
| Suggestion override rate    | suggestion        | `categorization_feedback_events` | edited or rejected / shown                |
| Precision at top suggestion | suggestion        | `categorization_feedback_events` | top suggestion becoming final / shown     |
| Confidence calibration      | confidence bucket | `categorization_feedback_events` | accepted / shown by bucket                |
| Human touches per 100 txns  | client-period     | feedback + txns                  | manual touch count / imported txns \* 100 |

### 12.4 Business health metrics

| Metric                       | Grain        | Source                      | Formula                                          |
| ---------------------------- | ------------ | --------------------------- | ------------------------------------------------ |
| Active firms                 | day or month | `eval_firm_daily_snapshots` | firms with meaningful activity                   |
| Active client books          | day or month | `eval_firm_daily_snapshots` | distinct client companies with workflow activity |
| Closed periods per firm      | month        | `eval_workflow_run_facts`   | closed bookkeeping runs per firm                 |
| Signup to first bank link    | company      | onboarding + bank events    | first bank success - company creation            |
| Signup to first closed month | company      | workflow facts              | first closed workflow - company creation         |
| Retention by cohort          | cohort       | snapshots                   | active firms retained at 30/60/90 days           |

## 13. The Four Dashboards We Actually Need

Do not start with a huge BI maze.

### 13.1 Operations dashboard

Audience:

- managers
- firm admins
- internal ops

Shows:

- open workflow runs by stage
- overdue runs
- top stuck client-periods
- backlog by task type and assignee
- blocker mix and blocker age
- median close time trend

### 13.2 Client friction dashboard

Audience:

- product
- ops
- support

Shows:

- disconnected bank recovery time
- client-visible task aging
- session-to-action conversion for client users
- time to first client action after a prompt
- blocked periods attributable to client-side dependencies

Important:

- do not report fake `open_client_queries` metrics until that feature exists

### 13.3 AI quality dashboard

Audience:

- product
- ML
- engineering

Shows:

- AI usage and success
- cost trend
- acceptance and override rates
- confidence calibration
- by-model breakdown
- by-tenant breakdown

### 13.4 Business dashboard

Audience:

- founder
- leadership

Shows:

- active firms
- active client books
- closed periods
- time to value
- retention
- expansion markers

## 14. Alerts We Should Run

Initial operational alerts:

- disconnected bank blocker older than 24 hours
- workflow run overdue by more than 3 days
- review requested state older than 48 hours
- hard-blocked task rate above threshold for a firm
- AI override rate spike week over week
- AI cost per closed period exceeds threshold for two consecutive periods

Alert payload should include:

- firm
- client
- workflow run or task id
- metric or blocker code
- current value
- threshold
- link back into the relevant product surface

## 15. Data Quality Rules

Without these, the whole system becomes noisy.

Rules:

- every event should carry stable company context
- every workflow or task action should attach linked ids when available
- event names should be typed and centrally defined
- timestamps should be UTC in storage
- no analytics event should block core product flows
- avoid PII in metadata unless it is strictly needed
- dashboard queries should read from derived fact tables, not raw operational joins

## 16. Privacy And Compliance Stance

Principles:

- store the minimum necessary event metadata
- prefer ids and categorical flags over raw free text
- avoid storing transaction descriptions or sensitive financial payloads inside
  analytics events
- keep sensitive source detail in operational tables, not evaluation events
- allow deletion or redaction paths if policy later requires it

## 17. What Not To Do

Avoid these failure modes:

- using Mixpanel alone as the system of record
- measuring only page views and clicks
- shipping dashboards before defining metric meaning
- treating AI usage as proof of AI value
- reporting client-friction metrics from placeholder systems
- letting every team define "active" differently

## 18. Recommended Build Order

### Phase 1

- build DB-truth fact tables from existing workflow and task schema
- ship operations dashboard
- ship basic business dashboard

### Phase 2

- add `product_events`
- instrument dashboard, workbench, close, financials, banking, onboarding
- build session facts

### Phase 3

- add `categorization_feedback_events`
- instrument accept/edit/reject outcomes
- ship AI quality dashboard

### Phase 4

- add experiment metadata
- build scorecards and risk signals
- use evaluation system for product and operational experiments

## 19. Immediate Implementation Notes For This Repo

Given the current codebase, the most pragmatic starting point is:

1. Treat `workflow_runs` as the spine.
2. Build `eval_workflow_run_facts`, `eval_task_facts`, and `eval_blocker_facts`.
3. Add a canonical `product_events` table plus typed API writer.
4. Instrument dashboard, workbench, financial drills, and bank reconnect.
5. Add `categorization_feedback_events` only after the product event plumbing exists.

Existing pieces that should be reused:

- workflow/task tables and task evaluation worker
- `ai_chat_runs` telemetry model
- audit event writing

Current holes to explicitly avoid pretending are solved:

- `open_client_queries`
- full client-friction attribution
- model acceptance/override tracking in a clean canonical table

## 20. Definition Of Success

This evaluation system is good enough when:

- we can identify the top blockers to closing without manual digging
- we can tell whether a product surface is reducing confusion
- we can tell whether AI saves work or creates rework
- we can tie operational health to retention and expansion
- leadership dashboards use stable metric definitions instead of ad hoc queries

At that point, evaluations stop being "analytics work" and become part of how the
company runs the product.
