# Demo Data Strategy

## Purpose

Demo data should let users experience the real product without risking shared
state, production accounting rules, or developer confidence.

The demo system is infrastructure for creating, resetting, and removing
disposable product workspaces. It is not a second accounting model, and it
should not require business tables to grow demo-specific flags or alternate
behavior.

## Product Goals

A strong demo experience should:

- feel like the real application, not a static walkthrough
- let users create, edit, post, categorize, reconcile, and correct records
- isolate each user's changes from other users
- return to a known state when reset or expired
- preserve the same accounting invariants as production during normal use
- remain easy for engineers to seed, inspect, reset, and extend

Demo UX and demo DX both matter. The product should feel safe and disposable
to a user, while the implementation remains explicit enough that engineers can
trust what is being created and removed.

## Core Model

The long-term model is:

1. Maintain a small set of canonical demo templates.
2. Provision isolated demo instances from those templates.
3. Let users make real backend changes inside their own demo instance.
4. Reset or expire demo instances by purging disposable instance data.

Users should not directly mutate canonical templates, and multiple users
should not share the same mutable demo workspace.

## Templates

A canonical demo template is the pristine source dataset we maintain. It should
represent a useful product story and remain stable enough to copy repeatedly.

Likely templates:

- `firm_demo_us`: an accounting firm workspace with a few client companies.
- `client_demo_us`: a single US business/client workspace.
- `client_demo_ng`: a single Nigerian business/client workspace.

Templates are not user playgrounds. They are source material for provisioned
instances. Template updates should be intentional, reviewable, and repeatable.

## Instances

A demo instance is a private, disposable copy provisioned from one template for
a user, anonymous session, sales review, internal QA run, or automated test.

Changes inside a demo instance may persist for the life of that instance, but
they should not affect any other user or the canonical template.

An instance may own one or more companies:

- A firm demo needs multiple client companies because firm workflows are
  multi-client by nature.
- A client/business demo should usually be one strong company because that is
  the clearest product experience for a business user.

This means we do not need many shared mutable demo companies. We need a small
set of good templates and a clean way to provision isolated instances from
them.

## Shared Versus Isolated Demo Data

Shared mutable demo workspaces are a poor default:

- one user can break another user's demo
- reset timing becomes ambiguous
- support and debugging become harder
- destructive actions need special product rules

The preferred default is isolated demo instances. If we ever expose a shared
public demo, it should either be read-only, reset very aggressively, or be
treated as a temporary preview environment with no expectation of persistence.

## Persistence Policy

Demo changes should persist long enough to support the user's current
evaluation flow, but they should not become durable business records.

Reasonable long-term policies:

- authenticated users can keep a demo instance until they reset it or it
  expires
- anonymous users get shorter-lived instances
- internal review and automated test instances can be deleted on demand
- canonical templates are preserved and updated only through seed/template
  maintenance workflows

The exact retention window can be a product decision. The data model should
support both explicit reset and automatic expiry.

## Identifying Demo Data

Demo-ness should live at the workspace/company boundary, not on every business
action.

Prefer:

- `companies.workspace_class = 'demo'`
- later, a dedicated demo instance/workspace record that owns one or more demo
  companies

Avoid:

- adding `is_demo` or seed flags to every journal, ledger transaction, bank
  transaction, project, contact, or artifact
- branching normal business logic based on whether a single action is demo

Rows created under a demo company are demo data by ownership. Business tables
should keep their normal shape and rules.

For global rows that cannot inherit company ownership, use explicit seed or
instance ownership metadata only when needed.

## Application Behavior

Normal app behavior should be the same for demo and non-demo companies unless a
product requirement truly says otherwise.

For example:

- posted accounting data should still be immutable during normal use
- corrections should use the same reversal, supersession, or adjustment flows
- validation should not become looser because the company is a demo company
- audit logs can still be written inside demo companies

The application may choose to show demo-specific UX, such as reset controls,
expiration warnings, or sample-data labels. That presentation concern should
not leak into every domain table.

## Creation Behavior

Seed creation should use normal application/domain behavior wherever
practical.

For example, seeded journals should be created through journal posting code so
they exercise the same validation, ledger posting, and accounting behavior as
the app. This keeps the demo realistic and prevents seed-only shortcuts from
drifting away from production behavior.

Direct database inserts are acceptable for stable reference data or
infrastructure setup, but business workflows should prefer domain services
when those services exist and are practical to call.

## Reset And Teardown Behavior

Seed reset is different from normal business behavior.

Production accounting data should be immutable. A posted ledger transaction is
history. In the app, correcting it means superseding, reversing, or posting new
records, not erasing it.

Demo reset is fixture teardown. It may physically remove disposable demo data
so the demo can return to a known state.

That means:

- app behavior should preserve accounting immutability
- demo teardown may purge demo-owned fixtures
- purge permission must be narrow, explicit, and limited to demo workspaces
- delete ordering should remain visible and intentional

The teardown mechanism should not use broad database switches such as
`session_replication_role = replica`, and should avoid disabling triggers with
`ALTER TABLE ... DISABLE TRIGGER`. Those approaches are too broad and can hide
bad delete ordering or unrelated integrity issues.

## Immutable Tables

Some tables intentionally block hard deletes, including ledger, banking, audit,
and future accounting-history tables. Demo reset still needs a controlled way
to remove disposable rows from those tables.

The preferred approach is a narrow database escape hatch:

1. The seed runner enters an explicit transaction-local teardown context.
2. Immutable-table delete triggers check that teardown context.
3. The triggers allow hard delete only when the target row belongs to a demo
   company/workspace.
4. Outside that context, hard deletes continue to fail.

Conceptually:

```sql
SELECT set_config('app.demo_seed_teardown', 'on', true);
```

The flag must be transaction-local and used only by demo seed teardown code.
Ordinary app sessions should never set it.

Future immutable tables should adopt the shared teardown helper rather than
creating table-specific bypasses.

## Audit Logs And Artifacts

Demo companies may still produce audit logs, generated files, imported
documents, categorization artifacts, training candidates, and other derived
records.

Long term, teardown should treat these as owned instance data:

- company-owned artifacts should be removed with the demo instance
- global artifacts should have explicit instance ownership when necessary
- audit logs for disposable demo activity may be purged during teardown
- derived records should be regenerated from templates rather than preserved
  as canonical data

The goal is not to pretend the activity never happened in production. The goal
is to remove a disposable demo instance cleanly because it was never production
business data.

## Expected Future Shape

A fuller demo system will likely need:

- canonical template definitions
- demo instance records
- ownership links from instances to companies
- reset and expiry metadata
- teardown orchestration that knows all demo-owned resources
- observability around demo provisioning and teardown failures

Until that exists, the current seed runner can act as the interim teardown
orchestrator, provided each immutable table uses the shared database policy and
each seed module deletes its owned records in a clear dependency order.

## Current Implementation

The shared teardown policy is defined in its own migration:

```text
apps/api/migrations/20250403174480_demo_seed_teardown_policy.ts
```

That migration creates:

```sql
app.is_demo_seed_teardown_allowed(target_company_id uuid)
```

Immutable table delete triggers call this helper before raising their normal
hard-delete exception. The helper returns true only when both conditions are
met:

- the current transaction has `app.demo_seed_teardown = on`
- the target company has `workspace_class = 'demo'`

The demo seed runner enables the transaction-local teardown context during
`reverse()`:

```sql
SELECT set_config('app.demo_seed_teardown', 'on', true);
```

Current immutable-table coverage:

- `ledger_transactions`
- `ledger_entries`
- `bank_transactions`

Current seed cleanup still lives in the existing seed modules. This is an
interim implementation, not the final demo instance architecture.

## Current Ledger Transaction Implication

`ledger_transactions` are immutable posting headers. They no longer use
`is_deleted` or `deleted_at`; active lifecycle is represented by `status`.

For normal app behavior:

- posted rows remain as history
- replacements use supersession
- hard delete is blocked

For demo teardown:

- seeded journal and bank ledger transactions may be physically purged only
  when they belong to demo companies and the seed runner is in explicit
  teardown mode
- associated ledger entries and audit logs must be purged in the correct
  dependency order
- the teardown should remain scoped to demo fixtures, not all ledger rows

This keeps production accounting rules honest while preserving a clean reset
experience for demo data.
