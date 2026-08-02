# Accountable Books — Observability Strategy

_Authored 2026-05-24. Built from first principles, not from existing code patterns._

---

## Philosophy

Observability is not a s3ingle tool. It is a capability — the ability to ask any question about system behavior without deploying new code. For an accounting platform, this capability has three distinct layers of urgency:

1. **Financial data integrity**: Wrong numbers destroy trust, and trust in an accounting product is everything. This must be monitored continuously, not periodically.
2. **Operational reliability**: Users running month-end closes cannot have their jobs interrupted. Latency and availability are load-bearing.
3. **Product improvement**: The only way to beat incumbents is to learn faster. Every user action is a signal.

The strategy below covers all three layers across six domains: infrastructure, database, AI/ML pipeline, product analytics, business metrics, and security. Each domain has its own observability needs and tools.

---

## Layer 1 — Infrastructure & Application Monitoring

### Logging: Structure Everything

Adopt structured JSON logs from day one. Every log line must be valid JSON. Use `pino` in Node.js — it is the fastest structured logger and has excellent context propagation.

**Mandatory fields in every log entry:**

```json
{
  "timestamp": "2026-05-24T14:23:45.123Z",
  "level": "info|warn|error|debug",
  "service": "api|worker|scheduler|ml-engine",
  "traceId": "...",
  "spanId": "...",
  "correlationId": "req-12345",
  "tenantId": "firm-abc123",
  "userId": "user-789",
  "message": "Ledger entry created",
  "context": { ... }
}
```

**Log levels — accounting-specific meanings:**

- `error`: Failed transactions, auth issues, data integrity violations, sync failures
- `warn`: Slow queries (>500ms), queue delays, retry attempts, approaching rate limits
- `info`: Completed financial transactions, job starts/completions, imports
- `debug`: Intermediate processing steps (never in production by default)

**Retention:**

- Hot (queryable, fast): 7 days
- Warm (searchable): 30 days
- Cold (archived, immutable): 1 year minimum (accounting regulatory requirement)

**Never log:** raw bank credentials, full JWT tokens, passwords, tax IDs, full account numbers. Redact these at the logging middleware layer.

---

### Distributed Tracing: Connect the Dots

The system has three processes (API, worker, scheduler) plus the Python ML engine. Without tracing, a categorization failure is impossible to debug. The trace must flow across all of them.

**Use OpenTelemetry + W3C Trace Context** — the only standard worth adopting. Pass `traceparent` headers between services and inject trace context into BullMQ job payloads.

**The trace chain for a typical bank transaction categorization:**

```
POST /api/bank-transactions/sync  [API span]
  ├─ PostgreSQL: insert bank_transactions  [DB span]
  ├─ BullMQ: enqueue enrichment job  [Queue span]
  │   [async, different process]
  │   Worker: process enrichment  [Worker span]
  │   ├─ Redis: cache company COA  [Redis span]
  │   ├─ HTTP: POST /api/v1/predict  [ML Engine span]
  │   │   FastAPI: inference  [Python span]
  │   │   ├─ TF-IDF: GlobalIntentClassifier
  │   │   └─ TenantAccountRanker
  │   └─ PostgreSQL: insert categorization_candidate
  └─ BullMQ: enqueue balance-recalc job
```

**Trace context in BullMQ jobs:**

```javascript
// When enqueueing from API
await enrichmentQueue.add('enrich', {
  txIds: [...],
  _trace: { traceId: req.traceId, spanId: req.spanId },
  tenantId: req.tenantId,
})

// In worker, restore context before processing
const parentCtx = contextFromTrace(job.data._trace)
const span = tracer.startSpan('enrichment', { parent: parentCtx })
```

**Sampling strategy (control costs):**

- 100% of all errors
- 100% of requests > 1 second
- 100% of financial write operations (journal post, ledger create)
- 5% of normal reads

---

### Metrics: The 15 That Matter Most

For Node.js + PostgreSQL + Redis + BullMQ, these 15 metrics catch 80% of problems:

**Application (Node.js/Express):**

1. `http_request_duration_seconds` — P50, P95, P99 by endpoint
2. `http_requests_total` — by method, endpoint, status
3. `event_loop_delay_seconds` — canary metric; >100ms means GC or CPU saturation
4. `nodejs_heap_size_used_bytes` — trending up without GC = memory leak

**Database (PostgreSQL):** 5. `pg_pool_idle_connections` — must never reach 0 6. `pg_pool_waiting_clients` — must always be 0; any value means clients are blocked 7. `pg_query_duration_seconds` — P95 per query type 8. `pg_active_long_transactions` — transactions running >60s are stalled 9. `pg_table_bloat_ratio` — alert at >30%; schedule VACUUM ANALYZE

**Queue (Redis + BullMQ):** 10. `bullmq_queue_size` — by queue name; balance-recalc >50 is a problem 11. `bullmq_job_duration_seconds` — P95 by queue 12. `bullmq_failed_jobs_total` — failure rate >1% per queue is systemic 13. `redis_evicted_keys_total` — must always be 0; eviction = job loss

**Business-critical:** 14. `trial_balance_imbalance_detected` — counter; any value >0 is a P1 incident 15. `bank_sync_staleness_hours` — per bank account; alert at >4 hours

---

### Health Checks: Three Tiers

**Liveness** (is the process alive?):

```
GET /health/live → { status: "alive" }
No dependencies checked. Must respond in <10ms.
```

**Readiness** (can it handle traffic?):

```
GET /health/ready
Checks: PostgreSQL ping (<100ms), Redis ping (<50ms), ML service ping (<500ms)
Used by Fly.io load balancer. Returns 503 if any dependency is down.
```

**Deep health** (diagnostic, internal only):

```
GET /health/deep
Checks everything: pool utilization, replication lag, queue depths, heap usage,
event loop delay, slow query count, partition status, ML engine model load time.
Not used by load balancers. Used by dashboards and on-demand debugging.
```

---

### Alert Taxonomy: Four Tiers

**Design principle**: Alert on symptoms, not causes. Alert when users are impacted, not when internal metrics drift. A small on-call team should receive at most 1-2 P1 alerts per week. If you're paged nightly, the alerts are miscalibrated.

**P1 — Page immediately, affects users now:**

- API availability <99.9% for 5 minutes
- Trial balance imbalance detected (any amount)
- Redis eviction detected (`redis_evicted_keys_total > 0`)
- Break-glass support access opened without approval
- Database connection pool waiting clients >0 for 2+ minutes

**P2 — Notify within 15 minutes, affects users soon:**

- `balance-recalc` queue depth >100 for 5+ minutes (customers see stale balances)
- P95 API latency >1 second for 5+ minutes
- Bank sync stalled >4 hours for any firm
- Worker process offline (jobs accumulating, not processing)
- ML engine unreachable >2 minutes

**P3 — Daily digest, fix next business day:**

- Slow query trend increasing >50% vs weekly baseline
- Job retry rate up >100% week-over-week
- Redis memory usage >80%
- Table bloat ratio >25%
- Replica lag >5 seconds

**P4 — Informational, resolve when convenient:**

- Index bloat >30% (schedule REINDEX)
- SSL certificate expiring in <30 days
- Node.js heap trending up (potential slow leak)

---

### Tools Recommendation

**Phase 1 — Now (~$50-150/month):**

- **Axiom** for logs: cheap ($0.10/GB), excellent Fly.io integration, no infra to manage
- **Grafana Cloud free tier** for metrics (Prometheus): free up to 10K series
- **Bull Board** for queue UI (already exists): augment with custom Prometheus metrics

**Phase 2 — Growing (~$200-500/month):**

- **Grafana Cloud** for unified logs + metrics + traces (Loki + Prometheus + Tempo)
- **pganalyze** for PostgreSQL: index advisor, slow query insights, bloat detection ($50-300/month)

**Phase 3 — Scale (>$500/month):**

- **Datadog** or **Honeycomb**: unified observability, better ML for anomaly detection
- Honeycomb particularly strong for high-cardinality event analysis (per-tenant debugging)

---

## Layer 2 — Database Observability

PostgreSQL is the system of record. Its health directly equals financial data integrity.

### Queries to Monitor Always

Enable `pg_stat_statements` extension. Query it daily:

```sql
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 500
ORDER BY mean_exec_time DESC
LIMIT 20;
```

**High-risk patterns for an accounting platform:**

- Balance calculations: `SELECT SUM(amount) FROM ledger_entries WHERE ...` — cache these
- Permission checks: run on every request — must be indexed and cached
- Month-end reconciliation: `SELECT * FROM ledger_entries WHERE month = ? AND reconciled = false` — batch these
- Audit trail exports: always paginate, never full-table export in a single query

### Lock Contention Detection

Lock contention is the most common cause of accounting write failures. Monitor:

```sql
SELECT blocked_locks.pid, blocked_locks.relation::regclass, blocking_locks.pid
FROM pg_locks blocked_locks
JOIN pg_locks blocking_locks ON blocking_locks.pid != blocked_locks.pid
  AND blocking_locks.relation = blocked_locks.relation
WHERE NOT blocked_locks.granted;
```

Alert if any `AccessExclusiveLock` is held for >30 seconds.

### Partition Hygiene

Ledger entries are date-partitioned. The `partitionMaintenance` job creates future partitions, but monitor:

- Future partitions exist at least 90 days ahead
- Partition sizes are not unexpectedly large (data explosion signal)
- No queries are hitting the default partition (means future date data was written wrong)

### Data Integrity Checks (Financial-Specific)

These run as scheduled jobs and also as synchronous post-write hooks:

**1. Trial Balance Check** (run after every journal post + every 5 minutes async):

```sql
SELECT SUM(CASE WHEN side = 'debit' THEN amount ELSE -amount END) AS net
FROM journal_entries
WHERE journal_batch_id = ?
HAVING ABS(SUM(...)) > 0.01;  -- tolerance for rounding
```

If net != 0, this is a P1 incident. Reject the entry immediately at the API layer.

**2. Balance Snapshot Continuity** (run nightly):

```
expected_balance = last_snapshot.closing_balance + SUM(entries since snapshot date)
if expected_balance != current_snapshot.opening_balance:
  ALERT: balance_snapshot_discontinuity
```

**3. Orphaned Ledger Entries** (run hourly):

- Ledger entries with no parent `ledger_transaction`
- Journal entries with no parent `journal_batch`
- Bank transactions with `ledger_transaction_id` pointing to nonexistent record

**4. Double-Entry Invariants** (synchronous validation):

- Every ledger transaction must have exactly one `is_bank_leg = true` entry (for bank-sourced transactions)
- Debit + credit amounts must balance to zero within tolerance
- No ledger entry can reference a deleted COA account

---

## Layer 3 — AI/ML Pipeline Observability

### The Categorization Funnel

Every transaction passes through a pipeline. Instrument each stage:

```
Bank Transaction Imported
  → Enrichment (normalize description, resolve payee, temporal features)
    → Rule Engine (deterministic user rules)
      → [Rule Match] → auto-categorize or suggest
      → [No Match] → ML Prediction (TF-IDF → TenantAccountRanker → AccrualResolver)
        → [High Confidence] → auto-post to ledger
        → [Low Confidence] → present suggestion for human review
          → [Human Accepts] → post to ledger; flag as trainable
          → [Human Corrects] → post correction; log override pair (original → correction)
          → [Human Ignores] → remains uncategorized
```

Instrument every transition with a counter. This gives you full pipeline coverage metrics.

### Core Categorization Metrics

**1. Acceptance Rate** (primary quality signal):

```
acceptance_rate = ai_accepted / (ai_accepted + ai_rejected + ai_ignored)
```

Track by: GL account type, confidence bucket ([0.5-0.6], [0.6-0.7], [0.7-0.8], [0.8+]), company age, transaction source.

- > 75% overall: healthy
- <50% on a specific GL account: systematic issue with that category
- Dropping >5% week-over-week: model drift or data quality problem → alert

**2. Auto-Post Accuracy** (lagging, but critical):

- Sample 50-100 auto-posted transactions weekly for human audit
- Calculate post-hoc accuracy on sample
- Alert if sample accuracy <90%

**3. Confidence Calibration** (Expected Calibration Error):
For each confidence bucket, compute actual acceptance rate. If model says 85% confidence but actual acceptance is 50%, the model is overconfident. ECE target <0.10.

**4. Category Difficulty Matrix** (build and maintain monthly):
| GL Account | Acceptance% | Avg Confidence | Override Rate | Status |
|---|---|---|---|---|
| Fuel | 88% | 0.92 | 2% | Healthy |
| Meals & Ent | 58% | 0.67 | 18% | Needs rules |
| Professional Fees | 44% | 0.61 | 28% | Review vertical fit |

Accounts with <60% acceptance need either rule engine enhancement or are outside the model's training distribution.

**5. Rule Engine Health**:

```
Per rule, track:
- hit_rate: matches/day
- conflict_rate: times it competed with another rule
- override_rate: user rejected rule-based suggestion
```

Rules with 0 hits in 30 days are likely stale. Alert and suggest archiving. Rules with >20% override rate are misfiring — review and tighten conditions.

Surface new rule opportunities by clustering high-acceptance transactions with no matching rule: "User categorizes {Payee X} → {GL Y} 90% of the time. Create a rule?"

### Input Data Drift Detection

Track the distribution of incoming transaction features weekly:

- Description length, unique token count
- Amount distribution by GL account
- Day-of-week patterns
- New payees with no prior history (cold start)

A sudden shift in input distributions (e.g., new company category of clients coming onto the platform) will degrade accuracy before any metric catches it.

**Use Evidently (open-source)** for statistical drift tests (Kolmogorov-Smirnov) on feature distributions. Run weekly offline batch. Alert if drift detected on more than 3 features simultaneously.

### Feedback Loop Architecture

Every user correction is implicit ground truth. Capture it:

```
categorization_override_log:
  tx_id, description, amount
  ai_suggested_category, ai_confidence
  user_selected_category
  time_to_decision_seconds
  reason_code (if provided)
  timestamp, user_id, company_id
```

This table is your training dataset. Filter weekly: remove "one-time exceptions" (flagged by user) and focus on systematic corrections. Use to retrain TF-IDF weights monthly. A/B test new models against old: 20% traffic gets new model for 2 weeks; deploy if acceptance rate improves >3%.

### LLM / AI Chat Observability

**What to log for every conversation:**

```json
{
  "conversation_id": "conv_123",
  "user_id": "...",
  "company_id": "...",
  "query_topic": "categorization|reconciliation|tax|general",
  "model": "gpt-4o-mini",
  "tokens_input": 450,
  "tokens_output": 220,
  "latency_ms": 1200,
  "cost_cents": 2.8,
  "user_feedback": "helpful|not_helpful|null",
  "action_taken": "applied_suggestion|ignored|corrected",
  "hallucination_flag": false,
  "timestamp": "..."
}
```

**Quality signals (without manual review):**

- Did user take action based on AI suggestion? (strongest positive signal)
- Did user immediately correct the AI? (strongest negative signal)
- Chat abandonment mid-conversation (frustration signal)
- Return rate to AI chat (satisfaction signal)

**Cost tracking:** Monitor `cost_per_conversation` and `cost_per_helpful_response`. If helpful response costs rise without accuracy improvement, review prompt engineering.

**Use Langfuse** (once volume justifies it) for: session replay, cost analytics, hallucination detection prompts, evaluation datasets. Until then, log to PostgreSQL and query manually.

---

## Layer 4 — Product Analytics

### Why PostHog (Self-Hosted)

For a financial platform handling sensitive data across Nigeria and the US, data residency matters. PostHog self-hosted means:

- Full data ownership (no third-party access to financial behavior data)
- GDPR/NDPR compliance by design
- Built-in feature flags for A/B testing AI categorization
- Privacy controls for session recording (mask financial data by default)

### Three-Level Tracking Hierarchy

Every event must carry all three IDs:

```json
{
  "firm_id": "firm-abc", // billing unit, primary customer
  "company_id": "company-xyz", // which workspace (firm's or client's)
  "user_id": "user-123" // individual performing the action
}
```

Analysis by firm level answers: Is this firm healthy? Are they growing their client portfolio?  
Analysis by company level answers: Is this workspace actively used? Are features adopted?  
Analysis by user level answers: Where are individual users stuck? Who are the power users?

### The Activation Funnel (North Star)

"Activation" for an accounting platform is not signup. It is completing the first trusted month-end close.

```
1. firm_signup_completed
2. client_company_created                          (first 24h target)
3. bank_connection_authorized                      (first 72h target)
4. transactions_imported (count > 10)              (first week target)
5. categorization_accepted (AI-driven)             (first 2 weeks target)
6. close_workflow_completed (first full month)     (30-day target)
   → ACTIVATED
7. second_client_added OR team_member_invited      (expansion signal)
```

Measure drop-off at each step. Any step with >30% drop-off is a product problem, not a user problem.

**Time to Value target:** User should reach step 5 within 7 days of bank connection. Firms taking >14 days to first AI acceptance are at-risk.

### Core Product Metrics for an Accounting Platform

**1. Categorization Efficiency Rate:**

```
= (ai_accepted + auto_posted) / total_transactions
```

Month 1 baseline: ~40%. Month 3 target: >70%. This is the headline metric that shows AI value.

**2. Close Cycle Velocity:**

```
= days from period_open to close_workflow_completed
```

Baseline: 7-10 days for accounting firms. Target: 3-5 days by month 3. Track by cohort.

**3. Close Task Completion Rate:**

```
= tasks_completed / tasks_in_workflow
```

<70% = firm is filing incomplete books. P2 customer success flag.

**4. Client Portfolio Momentum (firm-level):**

```
= (new_clients_this_month - churned_clients_this_month) / total_clients
```

Positive = firm growing on platform. Negative = churn risk.

**5. AI Trust Score (per firm):**

```
= ai_accepted / (ai_accepted + ai_rejected) over last 30 days
```

<50% = firm doesn't trust AI. Investigate: wrong vertical? Outdated model? Bad rules?

**6. Weekly Active Firms:**

```
= firms with at least 1 user login in the last 7 days / total active firms
```

Should be >85% for healthy platform. Declining WAF predicts churn 30-45 days out.

### Customer Health Score

```
Firm Health Score (0-100):
  30% × Activity Score     = (close_cycles_last_30d ≥ 1) × 100
  25% × Quality Score      = categorization_accuracy_rate / 90%
  20% × Adoption Score     = ai_acceptance_rate / 75%
  15% × Growth Score       = active_clients / total_clients
  10% × Support Score      = 100 - (support_tickets_per_month × 10)

Thresholds:
  80-100: Healthy
  60-79:  At-risk → proactive CS check-in
  40-59:  Critical → escalate immediately
  <40:    Churn imminent → executive outreach
```

Compute nightly, export to CRM. Set Slack alerts when any firm drops >15 points week-over-week.

### Session Recording (Compliance-First)

Session recording on financial software requires masking:

**Safe to record:** navigation patterns, button clicks, form field interactions (not values), error states, onboarding flow, settings pages.

**Never record:** transaction amounts, account numbers, tax IDs, financial report content, chat interactions, reconciliation screens.

**Masking config in PostHog:**

- Mask all numeric fields >3 digits
- Mask routes: `/reconciliation/*`, `/reports/*`, `/close/*`, `/journals/*`
- Keep: element names, navigation events, validation error types

### Minimal Event Taxonomy (Implement in Order)

**Month 1 (Core Activation):**

```
firm_signup_completed
client_company_created
bank_connection_authorized
bank_connection_failed { error_code, error_reason }
transactions_imported { count, date_range_days }
categorization_accepted { method, confidence_score, category }
categorization_rejected { reason }
close_workflow_completed { total_time_min, tasks_completed, ai_utilization_pct }
```

**Month 2 (Depth & AI):**

```
ai_chat_opened { context }
ai_chat_response_received { feedback, action_taken }
close_task_abandoned { task_id, time_invested_min }
bank_reconciliation_completed { discrepancies_found, discrepancies_resolved }
team_member_invited { role }
feature_adopted { feature_name }
```

**Month 3 (Expansion & Health):**

```
payroll_import_completed
second_client_added
billing_plan_upgraded
support_ticket_opened { category }
api_error_encountered { endpoint, error_type }
```

---

## Layer 5 — Business Metrics & Revenue Health

### Revenue Metrics (Firm-First Model)

**MRR tracking needs to account for the firm → client structure:**

- Firm subscription MRR: direct revenue from firm plans
- Client-seat MRR: any per-client or per-seat charges
- Expansion MRR: revenue added from existing firms (new clients, tier upgrades)
- Contraction MRR: revenue lost from existing firms (client reduction, downgrades)
- NRR: (Opening MRR + Expansion - Contraction) / Opening MRR × 100. Target >110%.

**Leading revenue indicators:**

1. Client growth velocity per firm (clients added/week)
2. Feature adoption rate (non-adopters churn within 90 days)
3. Weekly Active Firms (declining WAF predicts churn 30-45 days ahead)
4. AI acceptance rate (proxy for perceived product value)
5. Support ticket volume and sentiment (rising tickets = product-market fit erosion)

### Workspace Health Segmentation

Run a nightly job that classifies every firm workspace into:

- **Thriving**: growing client count + high AI adoption + recent close completed
- **Stable**: flat client count + moderate adoption + closes happening
- **At-risk**: declining activity + low AI adoption + close not completed this month
- **Dormant**: no activity for >14 days → immediate CS flag

Surface this classification in an internal dashboard. The customer success team should start every week reviewing all "at-risk" and "dormant" firms.

---

## Layer 6 — Security Observability

### Authentication Monitoring

Log every authentication event with full context:

```json
{
  "event": "login_failed",
  "user_id": "...",
  "ip": "192.168.1.1",
  "user_agent": "...",
  "failure_reason": "invalid_password|user_not_found|account_locked",
  "attempt_count_1h": 5,
  "geo": { "country": "NG", "city": "Lagos" }
}
```

**Lockout policy:**

- 3 failures → 5-minute lockout
- 10 failures from same IP in 1 hour → temporary IP block
- 20 failures in 24 hours → force password reset + email notification

**Anomaly detection signals (flag for review, not auto-block):**

- Login from new geography (user usually in Lagos, now London → MFA challenge)
- Login at atypical hours (usual 9am-6pm WAT, now 3am → flag)
- Login from new device fingerprint after >30 days gap → require re-verification
- Refresh token used from different IP than where it was issued → revoke immediately

### Token Security

Track refresh token usage closely:

- Refresh token used from different IP: revoke entire token family (possible token theft)
- Refresh token rotated more than once in 5 seconds: possible race condition or replay attack
- Access token presented after expiry (>15 min): client-side caching bug — log and educate

### Support Access & Break-Glass Audit

Every support access grant and break-glass session must be:

1. Logged with justification, approved-by, and intended duration
2. Time-limited (read-only: 7 days max; write: 24 hours max; break-glass: 1 hour max)
3. Activity-logged during the session (which queries run, which records touched)
4. Reviewed weekly by a non-support engineering lead

Alert immediately if:

- Break-glass opened without manager approval
- Support user accessing firms not in their assigned scope
- Bulk data exported during support session
- Session extended beyond approved duration

### Financial Data Access Anomalies

Track per-user access patterns as a baseline. Alert on:

- User querying >5x their baseline number of accounts in an hour
- User suddenly accessing firms outside their firm's client list (permission boundary violation)
- Batch GL export (>1000 accounts at once) by a non-admin user
- Same amount appearing across multiple journal entries in rapid succession (potential double-post or fraud pattern)

---

## Layer 7 — Background Job Observability

### SLOs per Job Type

| Job Type              | Queue                        | SLO                   | Alert Threshold       |
| --------------------- | ---------------------------- | --------------------- | --------------------- |
| balance-recalc        | balance-recalc               | 95% complete <5 min   | depth >100 for 2 min  |
| bank sync             | transaction-sync             | 90% complete <2 hours | stale >4 hours        |
| enrichment            | bank-transactions-enrichment | 95% complete <30 min  | depth >500 for 10 min |
| rule runner           | rule-runner                  | 95% complete <15 min  | failure rate >2%      |
| ML prediction         | ml-prediction                | 90% complete <2 min   | depth >200 for 5 min  |
| auto-post             | categorization-autopost      | 99% complete <1 hour  | any failure           |
| fiscal calendar       | fiscal-calendar              | 99% complete <10 min  | any failure           |
| journal auto-reversal | journal-auto-reversal        | 99% complete <30 min  | any failure           |
| recurring templates   | recurring-journal-templates  | 99% complete <1 hour  | any failure           |
| task evaluation       | task-evaluation              | 95% complete <5 min   | lag >10 min           |
| partition maintenance | partition-maintenance        | 99% complete <1 hour  | any failure           |
| email                 | email                        | 99% delivered <2 min  | failure rate >1%      |

### Dead Letter Queue Strategy

Jobs that exhaust all retries go to DLQ. Never ignore this.

- Alert immediately when any job enters DLQ
- Categorize each DLQ entry: transient error (should retry) vs permanent error (needs code fix) vs data error (tenant-specific issue)
- For `balance-recalc` DLQ entries: this is a P1 incident — users see wrong balances
- For `bank-sync` DLQ entries: P2 — transactions not flowing in
- For `email` DLQ entries: P3 — user not receiving notifications

Weekly DLQ review meeting: categorize all DLQ jobs from the week, create tickets for systemic patterns.

### Job Backlog vs Job Failure (How to Tell the Difference)

- **Backlog**: Queue depth growing, active job count at maximum concurrency, failure rate normal → need more workers
- **Failure**: Queue depth growing, active job count LOW, failure rate high → bug or dependency down
- **Slow processing**: Queue depth growing, active job count high but not at max, failure rate low → job taking longer than expected (database slow? ML engine slow?)

---

## Implementation Roadmap

### Foundation (Zero cost)

- [ ] Add structured JSON logging (pino) to Express API and workers with mandatory fields: traceId, tenantId, userId
- [ ] Enable `pg_stat_statements` extension in PostgreSQL
- [ ] Instrument BullMQ with custom Prometheus metrics: queue depth, job duration, failure rate per queue
- [ ] Build `/health/live`, `/health/ready`, `/health/deep` endpoints
- [ ] Add synchronous trial balance validation after every journal post

### Observability Stack (~$50-150/month)

- [ ] Deploy Axiom for log ingestion (connect via Fly.io log drain)
- [ ] Deploy Grafana Cloud free tier for metrics (Prometheus remote write)
- [ ] Create 4 core dashboards: API Health, Database Health, Queue Health, Data Integrity
- [ ] Wire P1 alerts (trial balance, Redis eviction, API availability) to Slack
- [ ] Add OpenTelemetry instrumentation to API; pass trace context to workers and ML engine

### Product Analytics

- [ ] Self-host PostHog on a small Fly.io machine
- [ ] Implement server-side tracking for Month 1 event taxonomy (activation funnel events)
- [ ] Add PII masking rules for all financial data properties
- [ ] Build activation funnel dashboard in PostHog
- [ ] Ship thumbs-up/down on AI categorization suggestions; wire to analytics + ML feedback loop

### AI/ML Observability

- [ ] Create `categorization_predictions` table with acceptance tracking
- [ ] Build weekly categorization quality report: acceptance rate by GL account, confidence calibration
- [ ] Implement Evidently for weekly input distribution drift detection (offline batch)
- [ ] Set up rule engine hit rate dashboard with staleness detection
- [ ] Log every LLM call to DB with cost and user feedback

### Business & Security

- [ ] Build firm health score computation (nightly job)
- [ ] Export health scores to CRM for CS team
- [ ] Implement security event logging: failed logins, anomalous access, break-glass sessions
- [ ] Set up pganalyze for database deep analysis
- [ ] Create account takeover detection rules with auto-lockout

### Later: Iteration

- [ ] Add Langfuse for LLM conversation tracing (if AI chat volume justifies it)
- [ ] Implement A/B testing framework for categorization model improvements
- [ ] Graduate to Grafana Cloud paid tier as log volume grows
- [ ] Build automated remediation for known failure modes (stale workers, lock contention)
- [ ] Post-incident review cadence: after every P1, update runbooks and fill observability gaps

---

## Runbooks (Critical Incidents)

### Runbook: Trial Balance Imbalance

```
1. ASSESS: What is the magnitude? ($0.01 = rounding; >$10 = serious)
2. CONTAIN: Set API to read-only mode if imbalance >$10 (pause new journal posts)
3. FIND: Query journal entries posted in last 15 minutes. Find the imbalanced batch.
4. FIX:
   - User error: void the entry, notify user, allow repost
   - System bug: revert entry, fix code, post-mortem
5. VERIFY: Run trial balance check again. Confirm zero imbalance.
6. LEARN: Add test case. Add API-layer validation to catch it earlier.
```

### Runbook: Balance Recalc Queue Backlog

```
1. ASSESS: How deep is the queue? How long has it been backing up?
2. CHECK WORKERS: Are balance-recalc workers alive? Check Fly.io process health.
3. CHECK DATABASE: Is there lock contention blocking recalc queries?
4. QUICK WIN: Restart workers (may clear stale assignments in Redis).
5. SCALE: Increase worker concurrency if CPU/RAM allows.
6. COMMUNICATE: Notify customers if >30 min delay expected.
7. POST-INCIDENT: Add index if recalc query is slow. Add worker auto-scaling trigger.
```

### Runbook: Account Takeover Suspected

```
1. LOCK: Immediately revoke all sessions for the affected user.
2. RESET: Force password reset; send email to account's verified address (not the login that failed).
3. AUDIT: Check audit_events for all actions by this user in last 24 hours. What did they access?
4. ASSESS: Was financial data exported? Were journal entries created? Were roles changed?
5. NOTIFY: Contact firm's admin. Provide activity report.
6. PREVENT: Enable MFA recommendation for the firm. Check if other accounts show similar patterns.
```

---

---

## Implementation Plan

The plan below maps every item in this strategy to a concrete set of code changes. It is organized into 16 phases, grouped by theme. The first 8 phases cover infrastructure and data integrity and should be treated as a continuous block — each one depends on the previous. Phases 9–16 are more independent and can be parallelized once the foundation is in place.

Some items in this strategy are not code changes — they are team processes (weekly DLQ reviews, post-incident reviews, break-glass access review cadence). Those are called out explicitly as process items and cannot be "shipped".

---

### Phase 1 — Context-Aware Structured Logging

_Covers: Layer 1 (logging)_

The pino HTTP logger is already in place in `app.ts` but it is a module-level singleton with no context propagation. Logs produced inside domain services carry no `tenantId`, `userId`, or `requestId`. This makes production debugging nearly impossible at scale.

**Files to create:**

- `apps/api/src/lib/request-context.ts` — `AsyncLocalStorage` store that holds `{ tenantId, companyId, userId, requestId, traceId }` for the duration of each request
- `apps/api/src/lib/logger.ts` — exports `getLogger(name?)` which returns a pino child logger that automatically reads from the async context store; all logs emitted through this carry the mandatory fields without the caller manually threading them

**Files to modify:**

- `apps/api/src/app.ts` — add a middleware after `verifyAccessToken` that seeds the async context store from the authenticated request; update `pinoHttp` config to pull context fields into the log serializer; never log raw passwords, tokens, tax IDs, full account numbers (redact at this layer)
- `apps/api/src/domains/journals/`, `apps/api/src/domains/ledgers/`, `apps/api/src/domains/categorization/`, `apps/api/src/domains/banking/` — replace `console.log` and ad-hoc logging with `getLogger()`
- `apps/api/src/worker.ts`, `apps/api/src/scheduler.ts` — seed async context at the start of each job from job payload metadata

---

### Phase 2 — Health Endpoint Hierarchy

_Covers: Layer 1 (health checks)_

The current `/health` endpoint returns `{ ok: true }` unconditionally. Fly.io uses this as a load balancer health check, meaning a DB outage still returns 200. The readiness check is the critical fix.

**Files to modify:**

- `apps/api/src/app.ts` — replace the single `/health` handler with three:
  - `GET /health/live` — returns 200 immediately with no dependency checks; used for process liveness
  - `GET /health/ready` — checks PostgreSQL ping (<100ms), Redis ping (<50ms), and ML engine reachability (<500ms); returns 503 if any fail; this is what the load balancer should ping
  - `GET /health/deep` — full diagnostic: pool utilization, queue depths per queue name, heap usage, event loop delay, slow query count from `pg_stat_statements`, partition status; not used by load balancer; used by internal dashboards and on-call debugging
- `fly.staging.toml`, `fly.production.toml` — update `[services.http_checks]` path from `/health` to `/health/ready`
- `apps/api/src/health.test.ts` — update test expectations to match new endpoint

---

### Phase 3 — Prometheus Metrics

_Covers: Layer 1 (metrics), Layer 7 (queue metrics)_

No metrics are currently exported. This phase instruments the three most important planes: HTTP, database connection pool, and BullMQ queues.

**New dependency:** `prom-client`

**Files to create:**

- `apps/api/src/lib/metrics.ts` — central Prometheus registry; defines all counters, gauges, and histograms: HTTP request duration, HTTP request total, active connections, event loop delay gauge, trial balance imbalance counter (starts at 0; any increment is a P1), bank sync staleness gauge per bank account
- `apps/api/src/lib/bullmq-metrics.ts` — attaches BullMQ event listeners (`completed`, `failed`, `stalled`, `active`) to each queue and emits counters and histograms; exports `attachBullMQMetrics(queue)` called once per queue
- `apps/api/src/lib/pg-metrics.ts` — a `setInterval` poller (every 30s) that queries `pg_stat_activity` for pool utilization (idle, waiting, total) and `pg_stat_statements` for slow query count; exports Prometheus gauges for each

**Files to modify:**

- `apps/api/src/app.ts` — add HTTP metrics middleware before route handlers; add `GET /metrics` endpoint behind `basicAuth` middleware
- `apps/api/src/worker.ts` — call `attachBullMQMetrics(queue)` for each of the 12 queues after they are initialized
- `apps/api/src/jobs/registry.ts` — ensure each queue instance is accessible for metric attachment

**Tooling (not code):**

- Set up Fly.io log drain pointing to Axiom for structured log ingestion
- Connect Grafana Cloud Prometheus remote write to `GET /metrics`
- Create 4 Grafana dashboards: API Health (latency, error rate, active requests), Database Health (pool utilization, slow queries, long transactions), Queue Health (depth per queue, job duration P95, failure rate), Data Integrity (trial balance imbalance counter, balance snapshot status)

---

### Phase 4 — Alert Infrastructure

_Covers: Layer 1 (alert taxonomy)_

Metrics with no alerts are just data. This phase wires the P1–P4 taxonomy from this strategy into actionable notifications.

**Tooling (not code):**

- Configure Grafana Cloud alerting rules for the full P1–P4 taxonomy defined in Layer 1 of this document
- P1 alerts → Slack `#incidents` channel + PagerDuty (or equivalent) for immediate page
- P2 alerts → Slack `#alerts` channel with 15-minute repeat
- P3 alerts → daily digest email to engineering
- P4 alerts → weekly digest or Grafana annotation only

The most critical P1 rules to wire first:

- `trial_balance_imbalance_detected > 0`
- `redis_evicted_keys_total increase > 0`
- `bullmq_queue_size{queue="balance-recalc"} > 100 for 2m`
- `pg_pool_waiting_clients > 0 for 2m`
- API availability `< 99.9% for 5m`

---

### Phase 5 — Database Observability

_Covers: Layer 2 (pg_stat_statements, lock contention, partition health)_

**Files to modify:**

- `apps/api/src/lib/pg-metrics.ts` — extend the existing poller with: lock contention gauge (count of `pg_locks` where `NOT granted`), long transaction gauge (count of transactions running >60s from `pg_stat_activity`), table bloat ratio query against `pg_stat_user_tables`
- `apps/api/src/jobs/schedules.ts` — add a new daily cron job `dbHealthCheck` that runs slow query analysis, surfaces top 10 queries by `mean_exec_time` from `pg_stat_statements`, and logs them as structured events for Axiom

**Database:**

- Enable `pg_stat_statements` via migration or direct DB command: `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`

**Grafana:**

- Extend the Database Health dashboard with: lock contention over time, long transaction count, bloat ratio by table, partition count and partition gap detection

---

### Phase 6 — Financial Data Integrity Enforcement

_Covers: Layer 2 (trial balance, balance snapshot continuity, orphaned entries, double-entry invariants)_

This is the highest-stakes phase. Errors here mean wrong numbers in production books.

**Files to modify:**

- `apps/api/src/domains/journals/journals.command.ts` (or wherever `postJournalRecord` commits) — add synchronous trial balance check inside the DB transaction, after inserting entries but before `trx.commit()`:
  ```sql
  SELECT ABS(SUM(CASE WHEN side = 'debit' THEN amount ELSE -amount END))
  FROM journal_entries WHERE journal_batch_id = ?
  HAVING ABS(SUM(...)) > 0.01
  ```
  If this returns a row, throw and roll back. Increment the `trial_balance_imbalance_detected` Prometheus counter. Never commit an imbalanced journal.

**Files to create:**

- `apps/api/src/jobs/integrity-checks.job.ts` — three independent checks run on a schedule:
  1. **Balance snapshot continuity** (nightly): for each COA account, assert `opening_balance[today] = closing_balance[yesterday]`; log any discrepancy as a structured error with account ID and delta
  2. **Orphaned entry detection** (hourly): find ledger entries with no parent `ledger_transaction`, journal entries with no parent `journal_batch`; log count and entity IDs
  3. **Double-entry sweep** (every 5 minutes): verify all `journal_batches` with `status = 'posted'` have debit sum == credit sum within tolerance; any that do not get flagged and increment the Prometheus imbalance counter

**Files to modify:**

- `apps/api/src/jobs/schedules.ts` — register all three checks on their respective schedules
- `apps/api/src/lib/metrics.ts` — add gauges for orphaned entry count, snapshot discontinuity count

---

### Phase 7 — Distributed Tracing

_Covers: Layer 1 (distributed tracing, trace context propagation)_

This phase enables end-to-end trace visibility from an API request through the worker through the ML engine. It is separate from Sentry (which handles errors) — traces handle the full call graph including successful slow paths.

**Files to create:**

- `apps/api/src/lib/tracing.ts` — initializes the OpenTelemetry Node SDK with auto-instrumentation for Express, `pg`, `ioredis`, and outgoing HTTP calls; configures OTLP exporter pointing to Grafana Tempo (or Axiom)

**Files to modify:**

- `apps/api/src/server.ts` — import `tracing.ts` as the very first import, before everything else (OTel must patch modules before they load)
- `apps/api/src/lib/bullmq-metrics.ts` — when enqueueing a job, read the current OTel span context and inject it into the job payload as `_trace: { traceId, spanId }`; in worker job processors, extract `_trace` from job data and create a child span linked to the parent
- `apps/ml-engine/` — add `opentelemetry-sdk-python` with `FastAPI` auto-instrumentation; accept and propagate `traceparent` header from inbound requests

**Sampling policy in `tracing.ts`:**

- 100% of requests resulting in 5xx errors
- 100% of requests taking >1 second
- 100% of financial write operations (identified by route pattern)
- 5% of all other requests

---

### Phase 8 — Job Queue SLOs and DLQ Strategy

_Covers: Layer 7 (SLOs, DLQ, backlog vs failure detection)_

**Files to modify:**

- `apps/api/src/lib/bullmq-metrics.ts` — add DLQ event listeners: when a job exhausts all retries and moves to the failed state, emit a `bullmq_dlq_total{queue_name}` counter; for `balance-recalc` and `categorization-autopost`, also emit a separate `bullmq_critical_dlq_total` counter that maps directly to a P1 Grafana alert
- `apps/api/src/lib/metrics.ts` — add `bullmq_job_wait_duration_seconds` histogram (time from enqueue to start) per queue; this enables SLO tracking separate from processing duration

**Grafana:**

- Add SLO panels to Queue Health dashboard: for each of the 12 queues, show "% of jobs completing within SLO window" as a Grafana recording rule; alert when any queue drops below its SLO threshold for 5 consecutive minutes

**Process item (not code):** Establish a weekly DLQ review: pull all DLQ entries from the week, categorize each as transient/permanent/data error, create engineering tickets for systemic patterns.

---

### Phase 9 — Product Analytics Expansion

_Covers: Layer 4 (activation funnel, 3-level tracking, event taxonomy)_

Mixpanel and the `trackEvent()` utility already exist. Only 2 events are tracked. This phase expands to the full event taxonomy without changing tooling.

**Files to modify:**

- `apps/api/src/shared/constants/tracking.constants.ts` — expand the Zod enum from 2 values to the full taxonomy defined in Layer 4 of this strategy (activation funnel events, categorization events, close workflow events, banking events, AI feature events, security events)
- Every event call, existing and new, must include `firm_id` and `company_id` as top-level properties alongside `distinct_id`; without these, multi-tenant analysis is impossible

**Files to add calls in (server-side):**

- `apps/api/src/domains/banking/` — `Bank Connected`, `Bank Connection Failed`, `Transactions Imported`
- `apps/api/src/domains/categorization/` — `Categorization Accepted`, `Categorization Rejected`, `Auto Post Applied`
- `apps/api/src/domains/journals/` — `Journal Posted`, `Journal Voided`, `Recurring Journal Created`
- `apps/api/src/domains/reporting/fiscal-calendar/` — `Period Opened`, `Close Workflow Started`, `Close Task Completed`, `Close Workflow Completed`, `Period Closed`
- `apps/api/src/features/auth/auth.service.ts` — `User Logged In`, `Email Verified`

**Frontend (`apps/web/src/`):**

- Add Mixpanel browser SDK for client-side events: feature discovery, navigation patterns, form abandonment, AI chat opened/closed, thumbs-up/down on AI suggestions
- Wire thumbs-up/down on AI categorization suggestions to both Mixpanel and the ML feedback loop (Phase 11)

---

### Phase 10 — Customer Health Score

_Covers: Layer 4 (health score), Layer 5 (workspace health segmentation)_

**Files to create:**

- Migration: `firm_health_scores` table — `firm_id`, `score` (0–100), `activity_score`, `quality_score`, `adoption_score`, `growth_score`, `support_score`, `segment` (thriving/stable/at-risk/dormant), `computed_at`
- `apps/api/src/jobs/health-score.job.ts` — nightly job that reads from event log and Mixpanel/analytics data to compute the composite score formula defined in Layer 4; writes to `firm_health_scores`; emits a structured log event when any firm's score drops >15 points week-over-week
- `apps/api/src/jobs/schedules.ts` — register nightly at 1am UTC

**Files to modify:**

- `apps/api/src/jobs/registry.ts` — register the new health score queue

**Process items:** Export health scores to CRM weekly (webhook or CSV export initially). CS team reviews all firms in the "at-risk" and "dormant" segments at the start of every week.

---

### Phase 11 — AI/ML Categorization Observability

_Covers: Layer 3 (categorization funnel, acceptance rate, feedback loop)_

**Files to create:**

- Migration: `categorization_prediction_outcomes` table — `id`, `tx_id`, `company_id`, `user_id`, `suggested_category`, `actual_category`, `confidence_score`, `source` (rule/ml/auto), `accepted` (bool), `override_reason` (nullable), `time_to_decision_ms`, `model_version`, `created_at`
- `apps/api/src/domains/categorization/prediction-outcomes.model.ts` — insert function called whenever a user confirms or changes a categorization suggestion

**Files to modify:**

- `apps/api/src/domains/categorization/` — instrument every pipeline stage with Prometheus counters: `categorization_pipeline_total{stage}` where stage is `enriched`, `rule_matched`, `ml_predicted`, `auto_posted`, `human_accepted`, `human_corrected`; this gives full funnel visibility
- The endpoint where a user accepts/rejects an AI suggestion — call `insertPredictionOutcome()` with the full context
- `apps/api/src/lib/metrics.ts` — add `categorization_acceptance_rate` gauge updated on each outcome

**Grafana:**

- Weekly dashboard panel: acceptance rate by GL account type (the "category difficulty matrix"), confidence calibration chart (confidence bucket vs actual acceptance rate), acceptance rate trend over time

---

### Phase 12 — Rule Engine Observability

_Covers: Layer 3 (rule hit rates, conflict detection, staleness)_

**Files to modify:**

- `apps/api/src/domains/categorization/rules/rules.engine.ts` — after each rule evaluation, emit structured log events: `rule_evaluated`, `rule_matched`, `rule_conflict`, `rule_no_match`; include `rule_id`, `company_id`, `outcome`

**Files to create:**

- Migration: `rule_evaluation_log` table (or extend the existing `rule_logs` table if one exists) — daily aggregates of hit count, conflict count, override count per rule
- `apps/api/src/jobs/rule-health.job.ts` — weekly job that queries `rule_evaluation_log` to surface: rules with 0 hits in 30 days (stale), rules with >20% override rate (misfiring), opportunities for new rules (frequently accepted patterns with no matching rule)

**Grafana:**

- Rule health dashboard: hit rate per rule, conflict rate, staleness flag

---

### Phase 13 — LLM Observability

_Covers: Layer 3 (LLM call logging, cost tracking)_

**Files to create:**

- Migration: `llm_call_log` table — `id`, `conversation_id`, `user_id`, `company_id`, `model`, `tokens_input`, `tokens_output`, `cost_cents`, `latency_ms`, `user_feedback` (thumbs up/null/thumbs down), `action_taken` (applied/ignored/corrected), `hallucination_flag` (bool, default false), `created_at`
- `apps/api/src/domains/ai/llm-call-logger.ts` — wraps the OpenAI call in `ai.chat.service.ts` and logs to the table; pulls token usage from the OpenAI response object

**Files to modify:**

- `apps/api/src/domains/ai/ai.chat.service.ts` — call `llmCallLogger.log()` after each streaming response completes
- `apps/api/src/domains/ai/` — the endpoint that receives user feedback (thumbs up/down) must update the `user_feedback` field in `llm_call_log`

**Grafana:**

- LLM cost dashboard: cost per day, cost per conversation, cost per positive feedback (most important unit), average latency trend

**Process item:** When volume justifies it (>500 conversations/week), integrate Langfuse by pointing `llm-call-logger` at the Langfuse SDK instead of raw SQL — it adds session replay, evaluation datasets, and hallucination detection prompts.

---

### Phase 14 — ML Input Drift Detection

_Covers: Layer 3 (drift detection, confidence calibration)_

**Files to create (in `apps/ml-engine/`):**

- `ml_engine/monitoring/drift_detector.py` — uses Evidently to compute: Kolmogorov-Smirnov test on transaction description token distributions vs a stored baseline snapshot; output is a drift report (JSON) with per-feature p-values and a binary `drift_detected` flag
- `ml_engine/monitoring/calibration.py` — computes Expected Calibration Error (ECE) from `categorization_prediction_outcomes`: bins predictions by confidence, computes actual acceptance rate per bin, outputs ECE score; ECE >0.10 is a calibration problem
- A weekly cron entry in `apps/ml-engine/` or a Python script triggered by the Node scheduler — runs both checks and posts results to Slack (or logs as a structured event to Axiom)

**Files to modify:**

- `apps/api/src/jobs/schedules.ts` — add a weekly job that calls the ML engine's `/monitoring/run` endpoint to trigger the drift check

---

### Phase 15 — Security Event Logging and Anomaly Detection

_Covers: Layer 6 (auth events, token security, break-glass audit, financial data access anomalies)_

**Files to create:**

- `apps/api/src/features/auth/auth.events.ts` — structured log functions for: `login_succeeded`, `login_failed` (with failure reason, attempt count, IP, geo), `account_locked`, `token_refreshed`, `token_refresh_from_new_ip` (flag), `logout`, `password_reset_requested`, `email_verified`, `session_expired`

**Files to modify:**

- `apps/api/src/features/auth/auth.service.ts` — call auth event functions on every auth outcome; for `login_failed`, also increment a Redis counter `login_attempts:{userId}` with a 1-hour TTL; when counter reaches 3, return 429 with a Retry-After header; when it reaches 10, force a password reset and notify the user
- `apps/api/src/domains/support-access/support-access.model.ts` — add activity logging during break-glass sessions: every DB query executed, every record modified during the session is logged to `support_session_activity` with the support user ID and timestamp
- `apps/api/src/core/middlewares/` — add a per-user access rate middleware that tracks how many unique accounts/companies a user queries per hour (stored in Redis); if current rate exceeds 5x their 30-day baseline, log a `financial_data_access_anomaly` event and alert on Slack

**Files to create:**

- Migration: `support_session_activity` table — `session_id`, `support_user_id`, `target_company_id`, `action`, `entity_type`, `entity_id`, `timestamp`

**Process item:** A non-support engineering lead reviews all break-glass sessions weekly. All `financial_data_access_anomaly` events are reviewed within 24 hours.

---

### Phase 16 — Business Metrics Dashboard

_Covers: Layer 5 (MRR/NRR, workspace health segmentation)_

**Files to create:**

- `apps/api/src/jobs/business-metrics.job.ts` — nightly job that reads from the billing tables (`billing_accounts`, `catalog`, `ownership`) to compute: MRR (sum of active subscriptions), expansion MRR (new clients added this month × per-client value), contraction MRR (clients removed × per-client value), NRR ((opening + expansion - contraction) / opening × 100)
- Migration: `business_metrics_snapshots` table — `date`, `mrr_cents`, `expansion_mrr_cents`, `contraction_mrr_cents`, `nrr_pct`, `active_firms`, `active_clients`, `new_firms`, `churned_firms`

**Files to modify:**

- `apps/api/src/jobs/schedules.ts` — register nightly at 2am UTC

**Grafana:**

- Business metrics dashboard: MRR trend, NRR trend, active firms and clients, new vs churned firms per month cohort view

---

### Coverage Verification

At the end of all 16 phases, here is what each layer of this strategy will have:

| Strategy Layer                 | Coverage After All Phases                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layer 1 — Infrastructure & APM | Complete: structured logs (P1), health endpoints (P2), Prometheus metrics (P3), alerting (P4), tracing (P7)                                               |
| Layer 2 — Database             | Complete: pg_stat_statements + lock contention (P5), trial balance + snapshot continuity + orphaned entries (P6)                                          |
| Layer 3 — AI/ML Pipeline       | Complete: categorization funnel counters + outcome logging (P11), rule engine observability (P12), LLM logging (P13), drift detection + calibration (P14) |
| Layer 4 — Product Analytics    | Complete: event taxonomy expansion + 3-level tracking (P9), health score (P10); session recording with masking is a frontend-only task not covered here   |
| Layer 5 — Business Metrics     | Complete: MRR/NRR computation (P16), workspace segmentation (P10)                                                                                         |
| Layer 6 — Security             | Complete: auth events + lockout (P15), break-glass audit (P15), financial access anomalies (P15)                                                          |
| Layer 7 — Background Jobs      | Complete: BullMQ metrics (P3), DLQ alerting + SLO tracking (P8)                                                                                           |

**What is genuinely not covered by any phase (process items, not code):**

- The weekly DLQ review meeting
- Post-incident review cadence after every P1
- CS team reviewing at-risk firms weekly using the health score dashboard
- Non-support engineering lead reviewing break-glass sessions weekly
- The actual creation of Grafana dashboards (the metrics and data are in place; the dashboards must be built in the Grafana UI)
- Session recording with masking in the web frontend (this belongs in the `apps/web/` codebase, not the API)

---

## Key Principles (Summary)

1. **Financial integrity is P1, always.** A wrong balance is worse than downtime. Validate synchronously, not async.
2. **Tenant context in everything.** Every log, metric, and trace must carry `tenantId` and `companyId`. Multi-tenant debugging without these is impossible.
3. **Symptom-based alerts, not cause-based.** Alert when users are impacted. If you must page, make sure a human can act on it in <5 minutes.
4. **Observability drives the AI improvement loop.** The feedback loop from human corrections → training data → better model only works if you instrument every step. The categorization quality metrics are not vanity metrics — they are the product's competitive advantage.
5. **Start cheap, stay purposeful.** Axiom + Grafana Cloud free tier is enough for the first 6 months. Add tools when the business case is clear, not because it's cool.
6. **Post-incident reviews are mandatory.** After every P1, the question is not "who is to blame" but "what was missing from our observability that made this hard to detect/debug/fix." Fill the gap.
