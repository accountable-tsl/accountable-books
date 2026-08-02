# Evaluations v1 Spec

Status: Draft for implementation
Last updated: March 28, 2026
Owner: Product + Engineering + Operations

## 0. Purpose

This document defines the first evaluation system for Accountable Books.

The goal is not "more analytics." The goal is to make the product, operations,
AI behavior, and business legible enough that we can answer:

- Are firms getting client books closed faster and with less confusion?
- Where does work stall in the month-close workflow?
- Is AI reducing labor or just shifting review burden?
- Which product behaviors predict retention, expansion, or churn?

This spec is intentionally grounded in the current system design:

- `workflow_runs` is the best unit for client-period workflow truth.
- `engagement_tasks`, `engagement_task_blockers`, and `engagement_task_events`
  are the best units for operational queue truth.
- `ai_chat_runs` is the current source of truth for AI usage and cost.
- Product interaction events are currently under-instrumented and must be added.

## 1. Decision

The primary unit of analysis for Accountable Books evaluations is:

- `workflow_run` = one client company + one domain area + one accounting period

For v1, this means:

- `client_company_id`
- `domain_area = bookkeeping`
- `fiscal_year`
- `period_number`
- `period_type`

Why this is the right unit:

- It matches the product north star: ingest -> classify -> adjust -> close -> report.
- It aligns with the new workflow engine and dashboard direction.
- It gives one stable frame for product, operations, and business metrics.
- It avoids the common failure mode of over-optimizing page views while users are
  still failing to finish the actual bookkeeping job.

Supporting units of analysis:

- `engagement_task` for queue, ownership, and resolution metrics
- `engagement_task_blocker` for friction and delay metrics
- `user session` for interaction and discoverability metrics
- `ai_chat_run` for AI usage, cost, and reliability metrics
- `categorization feedback event` for prediction quality metrics

## 2. Principles

1. Prefer system truth over inferred clickstream truth.
2. Measure user progress through accounting work, not vanity activity.
3. Keep one canonical event schema, even if data fans out to Mixpanel later.
4. Treat "blocked by client" and "blocked by system" as first-class states.
5. Segment every important metric by firm, client, period, user role, and country
   when possible.
6. Make definitions stable enough that teams can compare month to month.

## 3. Current Sources Of Truth

### 3.1 Existing canonical sources

- `workflow_runs`
  - lifecycle truth for a client-period
  - milestones already include `work_started_at`, `review_requested_at`,
    `approved_at`, `sent_at`, `closed_at`
- `engagement_tasks`
  - task inventory, assignment, status, due date, priority, resolution
- `engagement_task_blockers`
  - active blocker type, code, severity, and resolved timestamp
- `engagement_task_events`
  - task-level event history for created, assigned, status changes, blockers, etc.
- `ai_chat_runs`
  - AI usage, provider, model, request count, token usage, and cost
- audit events
  - useful for workflow-level summaries and future mutation tracking

### 3.2 Current gaps

- Main web app product analytics is not systematically instrumented.
- Current tracking enum only covers `User Signed Up` and `Company Created`.
- `open_client_queries` is currently a stub and must not be treated as a real
  client-friction metric yet.
- Firm dashboard and some accounting surfaces are still mock or partial.
- Categorization quality feedback needs explicit accept/edit/reject capture in a
  canonical format.

## 4. Evaluation Questions

### 4.1 Product health

- How long does it take a client-period to move from first work to closed?
- Which surfaces actually help users progress: dashboard, workbench, close hub,
  financials, AI assist?
- Do users find the next action quickly after opening the app?

### 4.2 Operational health

- What blockers are most common?
- What blockers create the most delay?
- Which task types accumulate backlog by firm, assignee, or client?

### 4.3 AI quality

- What percentage of suggestions are accepted with no material edit?
- What percentage are overridden?
- Does higher model confidence correlate with higher acceptance?
- What is the labor tradeoff: reduced touches vs. downstream review burden?

### 4.4 Business health

- Which firms are adopting the product deeply enough to retain?
- Which firms are expanding active client books?
- Which patterns predict churn risk?

## 5. Metric Catalog

### 5.1 North star

`Median close time`

Definition:

- Median elapsed time from `workflow_runs.work_started_at` to `workflow_runs.closed_at`
  for bookkeeping workflow runs in a selected period.

Why:

- It measures whether the system helps firms complete the job.

Primary segments:

- firm
- client
- country
- assignee
- month
- review cycle count

Guardrails:

- blocker rate
- reopen or rework rate
- AI override rate
- close without sent reports rate

### 5.2 Workflow health metrics

| Metric                    | Definition                                                                                               | Source                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------ |
| Open workflow runs        | Count of `workflow_runs` where `status != closed` and `is_deleted = false`                               | `workflow_runs`          |
| Close rate                | Closed runs / total active runs created in window                                                        | `workflow_runs`          |
| Stage conversion          | Share of runs progressing `not_started -> in_progress -> review_requested -> approved -> sent -> closed` | `workflow_runs`          |
| Stage dwell time          | Time spent between workflow milestones                                                                   | `workflow_runs`          |
| Review cycle count        | Average and distribution of `review_cycle`                                                               | `workflow_runs`          |
| Overdue runs              | Open runs with `due_date < today`                                                                        | `workflow_runs`          |
| Task backlog              | Open tasks grouped by `task_type`, `priority`, `assigned_to_user_id`                                     | `engagement_tasks`       |
| Task completion time      | `resolved_at - created_at` for completed tasks                                                           | `engagement_tasks`       |
| Tasks reopened indirectly | Count of tasks with repeated `status_changed` patterns back to active states                             | `engagement_task_events` |
| Hard-blocked task rate    | Open tasks where `is_blocked = true`                                                                     | `engagement_tasks`       |
| Warning-blocked task rate | Open tasks where `has_warnings = true`                                                                   | `engagement_tasks`       |

### 5.3 Blocker and friction metrics

| Metric                          | Definition                                                               | Source                                     |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| Active blocker count            | Count of active rows in `engagement_task_blockers`                       | `engagement_task_blockers`                 |
| Blocker incidence by code       | Count of active blockers grouped by `code`                               | `engagement_task_blockers`                 |
| Blocker severity mix            | Hard vs warning blocker distribution                                     | `engagement_task_blockers`                 |
| Time blocked                    | `resolved_at - created_at` for resolved blockers                         | `engagement_task_blockers`                 |
| Blocker persistence             | Count of blockers older than 1d, 3d, 7d                                  | `engagement_task_blockers`                 |
| Disconnected bank recovery time | Time from blocker creation for `disconnected_bank` to blocker resolution | `engagement_task_blockers`                 |
| Uncategorized transaction load  | Sum of blocker details count where code is `uncategorized_transactions`  | `engagement_task_blockers` or task metrics |
| Draft journal load              | Sum of blocker details count where code is `draft_journals`              | `engagement_task_blockers` or task metrics |

Important note:

- `open_client_queries` must stay out of executive dashboards until the backing
  system exists. It can appear only as a future metric placeholder.

### 5.4 Product interaction metrics

These require new event instrumentation.

| Metric                         | Definition                                                                                                         | Source                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Time to first useful action    | Time from session start to first task open, workflow open, bank reconnect, categorization edit, or financial drill | `product_events`                                 |
| Dashboard to action rate       | Share of dashboard sessions that lead to task or workflow action within same session                               | `product_events`                                 |
| Workbench deep-link rate       | Share of workbench views that continue into task detail or filtered queue                                          | `product_events`                                 |
| Financial drill usage          | Statement view -> line drill -> ledger/source drill conversion                                                     | `product_events`                                 |
| Empty or dead-end session rate | Sessions with only views and no meaningful action                                                                  | `product_events`                                 |
| Client response latency        | Time from client-facing request surfaced to client action taken                                                    | `product_events` plus future client-query system |

### 5.5 AI quality metrics

| Metric                                | Definition                                                        | Source                                           |
| ------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| AI usage rate                         | Share of active users who invoke AI in a period                   | `ai_chat_runs`                                   |
| AI run success rate                   | Completed AI runs / total AI runs                                 | `ai_chat_runs`                                   |
| AI token cost per active workflow run | Total AI cost / active bookkeeping workflow runs                  | `ai_chat_runs`, `workflow_runs`                  |
| Suggestion acceptance rate            | Accepted suggestions / total surfaced suggestions                 | `categorization_feedback_events`                 |
| Suggestion override rate              | Overridden suggestions / total surfaced suggestions               | `categorization_feedback_events`                 |
| Precision at top suggestion           | Share of cases where top suggestion becomes final accepted output | `categorization_feedback_events`                 |
| Confidence calibration                | Acceptance rate bucketed by confidence bands                      | `categorization_feedback_events`                 |
| Human touches per 100 txns            | Manual edits, splits, or overrides per 100 imported transactions  | `categorization_feedback_events` plus txn counts |

Important note:

- Acceptance and override metrics are required for the categorization engine, but
  are not yet available as a clean canonical stream. They must be instrumented.

### 5.6 Business metrics

| Metric                       | Definition                                                                          | Source                            |
| ---------------------------- | ----------------------------------------------------------------------------------- | --------------------------------- |
| Active firms                 | Firms with at least one meaningful workflow action in last 30 days                  | `workflow_runs`, `product_events` |
| Active client books          | Distinct client companies with active or closed bookkeeping workflow runs in window | `workflow_runs`                   |
| Closed periods per firm      | Count of closed bookkeeping workflow runs per firm per month                        | `workflow_runs`                   |
| Client book depth            | Median active client books per firm                                                 | `workflow_runs`                   |
| Signup to first bank link    | Time from company creation to first successful bank connection                      | signup events plus bank events    |
| Signup to first closed month | Time from company creation to first `closed_at`                                     | company data plus `workflow_runs` |
| 30/60/90 day retention       | Cohort retention by firm based on meaningful work activity                          | `workflow_runs`, `product_events` |
| Expansion signal             | Increase in active clients, closed periods, or active staff over time               | derived snapshots                 |

## 6. Canonical Event Model

### 6.1 Decision

Create one canonical `product_events` stream in Postgres.

Do not make Mixpanel the only source of truth.

Rationale:

- Product evaluations need stable joins to firm, client, workflow run, task, and role.
- We already rely heavily on Postgres-backed workflow truth.
- Vendor analytics can still receive a copy of these events for exploration.

### 6.2 Event envelope

Every event should include:

```ts
type ProductEvent = {
  id: string;
  event_name: string;
  event_version: string;
  occurred_at: string;
  actor_type: 'user' | 'system' | 'ai';
  user_id: string | null;
  firm_company_id: string | null;
  client_company_id: string | null;
  company_id: string | null;
  workflow_run_id: string | null;
  task_id: string | null;
  session_id: string | null;
  request_id: string | null;
  surface:
    | 'dashboard'
    | 'workbench'
    | 'close'
    | 'financials'
    | 'cat_engine'
    | 'ai'
    | 'banking'
    | 'onboarding'
    | 'system';
  role: string | null;
  country_code: string | null;
  metadata: Record<string, unknown>;
};
```

Naming rules:

- use dot-separated names
- use present-tense facts, not UI wording
- version event payloads when semantics change

Examples:

- `dashboard.viewed`
- `dashboard.task_queue_item_opened`
- `workbench.viewed`
- `task.opened`
- `task.completed`
- `task.blocker_viewed`
- `task.blocker_resolved`
- `workflow.review_requested`
- `workflow.approved`
- `workflow.closed`
- `financials.statement_viewed`
- `financials.line_drilled`
- `financials.source_opened`
- `financials.exported`
- `bank.reconnect_started`
- `bank.reconnect_completed`
- `onboarding.bank_link_started`
- `onboarding.bank_link_succeeded`
- `ai.chat_started`
- `ai.chat_completed`
- `ai.suggestion_applied`
- `ai.suggestion_dismissed`
- `categorization.suggestion_shown`
- `categorization.suggestion_accepted`
- `categorization.suggestion_edited`
- `categorization.suggestion_rejected`

### 6.3 DB truth vs. interaction truth

The evaluation system has two event classes:

1. DB-truth events
   - sourced from workflow/task tables and audit events
   - authoritative for operational and business outcomes
2. interaction events
   - sourced from web and API instrumentation
   - authoritative for discoverability, UX, and AI-assist behavior

Rule:

- If DB truth and interaction truth disagree, operational dashboards use DB truth.

## 7. Derived Models

Create the following derived views or tables for analytics and dashboards:

- `eval_workflow_run_facts`
  - one row per workflow run
  - includes milestone durations, overdue flag, review cycle count, close outcome
- `eval_task_facts`
  - one row per task
  - includes age, completion time, assignee, priority, blocked flags
- `eval_blocker_facts`
  - one row per blocker occurrence
  - includes blocker duration, severity, code, linked workflow/task dimensions
- `eval_product_events`
  - normalized product event stream with stable dimensions
- `eval_ai_usage_facts`
  - one row per AI chat run with cost and success dimensions
- `eval_firm_daily_snapshot`
  - one row per firm per day for executive reporting
- `eval_client_period_scorecard`
  - one row per client-period summarizing workflow health and friction

## 8. Dashboard Set

Ship four dashboards only.

### 8.1 Operations dashboard

Audience:

- firm admins
- managers
- internal ops

Purpose:

- see where work is stuck

Must include:

- open workflow runs by stage
- overdue workflow runs
- task backlog by task type and assignee
- blocker incidence by code and severity
- median close time trend
- review cycle distribution
- top 20 stuck client-periods

Primary filters:

- firm
- assignee
- country
- fiscal month

### 8.2 Client friction dashboard

Audience:

- product
- ops
- support

Purpose:

- see what clients are failing to do or understand

Must include:

- disconnected bank count and recovery time
- client-visible task aging
- time to first client action after prompt
- blocked periods attributable to client-side action
- session-to-action conversion on client dashboard

Important:

- exclude `open_client_queries` until the feature is real

### 8.3 AI quality dashboard

Audience:

- product
- ML
- engineering

Purpose:

- see whether AI is helping

Must include:

- AI run volume and success rate
- AI cost trend
- suggestion acceptance rate
- suggestion override rate
- confidence calibration
- human touches per 100 transactions
- by-model and by-tenant breakdowns

### 8.4 Business dashboard

Audience:

- founders
- product leadership

Purpose:

- track growth and retention quality

Must include:

- active firms
- active client books
- closed periods per month
- cohort retention
- signup to first bank link
- signup to first closed month
- firm expansion signals

## 9. Alerts

Alerts should be narrow and operational, not noisy.

Initial alerts:

- `disconnected_bank` blocker older than 24 hours for an active client
- bookkeeping workflow run overdue by more than 3 days
- workflow run in `review_requested` for more than 48 hours
- hard-blocked tasks for a firm exceed 20% of open tasks
- AI override rate increases by more than 20 percentage points week over week
- AI cost per closed period exceeds threshold for 2 consecutive weeks

Each alert must include:

- firm
- client
- affected workflow run or task
- blocker code or metric name
- current value
- threshold
- direct link into the relevant surface

## 10. Implementation Phases

### Phase 0: definitions and trust boundary

- approve this metric catalog
- mark which metrics are DB-truth and which need event instrumentation
- exclude placeholder data from executive dashboards

Exit criteria:

- product, engineering, and ops agree on metric definitions

### Phase 1: DB-truth evaluations

- build derived models from:
  - `workflow_runs`
  - `engagement_tasks`
  - `engagement_task_blockers`
  - `engagement_task_events`
  - `ai_chat_runs`
- ship operations dashboard
- ship business dashboard with conservative scope

Exit criteria:

- team can identify stuck client-periods and overdue workflow stages daily

### Phase 2: product event instrumentation

- add canonical `product_events`
- instrument dashboard, workbench, close, financials, banking reconnect, AI
- add session identifier and stable surface naming

Exit criteria:

- team can measure time to first useful action and session-to-action conversion

### Phase 3: AI quality instrumentation

- add categorization feedback event schema
- capture shown, accepted, edited, rejected outcomes
- connect feedback to model, confidence, company, and transaction context

Exit criteria:

- team can measure acceptance, override, and calibration by model version

### Phase 4: experiments and scorecards

- add experiment dimension to `product_events`
- build firm scorecards and churn-risk signals
- run dashboard/workbench and AI-assist experiments

Exit criteria:

- product changes can be evaluated against north star and guardrails

## 11. Recommended First Instrumentation Set

Implement these first because they are high-signal and low-ambiguity:

- `dashboard.viewed`
- `task.opened`
- `task.completed`
- `task.blocker_viewed`
- `workbench.viewed`
- `workflow.review_requested`
- `workflow.closed`
- `financials.statement_viewed`
- `financials.line_drilled`
- `financials.exported`
- `bank.reconnect_started`
- `bank.reconnect_completed`
- `ai.chat_started`
- `ai.chat_completed`

Fields required on all of them:

- user
- role
- firm
- client
- workflow run if applicable
- task if applicable
- surface
- occurred_at
- session_id

## 12. Known Gaps And Non-Goals

Known gaps:

- `open_client_queries` is not real yet
- some dashboard surfaces are still mock-backed
- main web app lacks standardized event plumbing
- categorization feedback is not yet normalized

Non-goals for v1:

- full warehouse program
- broad experiment platform
- advanced attribution modeling
- measuring every click

## 13. Acceptance Criteria

This spec is successful when:

- every leadership dashboard metric has one named source of truth
- the team can identify the top blockers to close completion without manual digging
- the team can separate workflow failure from discoverability failure
- the team can quantify whether AI saves work or creates rework
- product changes can be judged against close time, blocker rate, and user action speed

## 14. Immediate Follow-Up Work

1. Add a canonical `product_events` table and event writer in the API.
2. Expand tracking constants beyond signup-only events or replace them with a
   typed product event contract.
3. Build `eval_workflow_run_facts`, `eval_task_facts`, and `eval_blocker_facts`.
4. Instrument dashboard, workbench, close, financials, and banking reconnect.
5. Define and implement `categorization_feedback_events`.
6. Launch the operations dashboard before adding broad exploratory analytics.
