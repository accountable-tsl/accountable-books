# Accounting Work System: Build Log

Lean log for implementing `accounting-work-system-final-model.md`. One line per
decision or change. Everything is subject to change. Newest at bottom.

Rules we hold to: `work_item` = one finishable unit; `work_item_group` = grouped
display row; source facts are truth; build new alongside old, then delete old.

## Decisions

- D1 grouped table named `work_item_groups` (not `work_queue_groups`).
- D2 period column named `fiscal_period_id`, FK -> `app.fiscal_calendar(id)`
- D3 build new system alongside old; no bridging; delete old after parity.
- D4 free the `work_items` name by renaming old `work_items` -> `legacy_work_items`.
- D5 reuse shared plumbing (`outbox`, `notifications`, `comms_deliveries`, `activity_events`, `audit_events`, source facts); rebuild fresh only work-items, findings, and close logic; new engine gets its own outbox intent(s). "No bridging" = the work/findings/close domain only.
- D6 one fact per `work_item` (no subjects child table); showing many facts together is the job of `work_item_groups`.
- D7 "who": `responsible_party` = side (firm/client/internal), `assignee_id` = person (null = pool); the allowed-pool is derived from assignments/role, not stored.
- D8 actionability is viewer-relative: store `responsible_party` (+ an intrinsic block reason when real); derive actionable-vs-waiting per viewer. No global `actionability` column.
- D9 firm dashboard rows map to `work_item_groups` (client x scope rollups); rich display (due/overdue/blocked/priority) is aggregated on the group + derived in the read layer; `due_at` and block signal return with the close phase; reconcile `priority` naming (`urgent` vs `critical`) at the contract layer.

## Changelog

- 0a created this log.
- 0b renamed old `work_items` -> `legacy_work_items` (migration + `work-materialization.ts` + `work-queue.read.ts` + tests); `work_item_subjects` left as-is.
- 0d confirmed reuse-plumbing / rebuild-work-domain boundary (D5); fiscal FK target confirmed `app.fiscal_calendar` (D2).
- 1a wrote `work_items` migration: root/target polymorphic (no FK), partial-unique active `work_key`, no soft-delete, version default 0.
- 1a trimmed to real use cases: families = {categorization, finding, close}; `family`/`action_type` are free-text code vocabulary (only `status`/`priority` keep DB checks); dropped `responsible_party`, `actionability`, `assignee_type`, `due_at`, `snoozed_until`, `summary`. Re-add each in the phase that needs it (banking/close/agents). `title` kept stored for now (revisit store-vs-derive when the read layer exists).
