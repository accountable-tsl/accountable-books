# Database table reference

Architect-level spec: what each table is for, how it behaves, and what the schema should enforce.

**Audience:** backend engineers implementing migrations.  
**Not in scope here:** application code, seed scripts, broken imports, current-state audits — those belong in PRs / implementation.

---

## Two concerns (keep separate)

| Concern            | Location                  | Contains                                                                  |
| ------------------ | ------------------------- | ------------------------------------------------------------------------- |
| **Schema**         | `apps/api/migrations/`    | DDL only — `createTable`, indexes, constraints, triggers                  |
| **Bootstrap data** | `apps/api/src/bootstrap/` | Reference data, admin/system users, catalog seeds — run **after** migrate |

Migrations define structure. Bootstrap populates required rows. No `createUser`, no seed loops, no env-based admin setup inside migration files.

---

## Exercise goals

1. **Standardize migrations** — explicit columns (no `addStandardColumns` / `addUserAuditColumns` helpers); triggers stay explicit
2. **One table at a time** — agree spec here → align migration → move any seed logic to bootstrap
3. **Bootstrap separation** — all runtime/deploy seed data lives under `apps/api/src/bootstrap/`

---

## Attribute tags

Short tags describing behavior. Derive columns from these — don't apply a fixed bundle blindly.

| Tag                 | Meaning                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| identity root       | Referenced by `*_by_id` FKs; no self-referential `created_by_id`               |
| mutable             | Rows updated at runtime                                                        |
| append-only         | Insert once; no update/delete → `preventUpdateOrDelete`                        |
| immutable reference | Product constants; deploy-only writes                                          |
| tenant-scoped       | Belongs to a company (or firm) context                                         |
| soft-delete         | Deactivate via `is_deleted` / `deleted_at` (+ `deleted_by_id` if admin action) |
| status lifecycle    | Ends via status column, not soft-delete                                        |
| versioned           | History via `effective_at` / `expires_at` / `ended_at`                         |
| junction            | Links two entities; often no soft-delete                                       |
| child row           | Owned by parent; mutate through parent                                         |
| derived / snapshot  | Recomputed; not source of truth                                                |
| ephemeral           | Short-lived; domain expiry/consumed timestamp                                  |
| actor required      | Runtime writes record `created_by_id` / `updated_by_id`                        |

**Enforcement:** DB triggers for hard rules (append-only, `updated_at`). Access control in API layer — note intended roles/permissions, not implementation.

---

## Table index

| Table         | Purpose                   | Tags                                | Spec  |
| ------------- | ------------------------- | ----------------------------------- | ----- |
| `users`       | Global identity and auth  | identity root, mutable, soft-delete | below |
| `roles`       | Role definitions by scope | immutable reference, append-only    |       |
| `permissions` | Permission keys           | immutable reference, append-only    |       |
| …             |                           |                                     |       |

---

## Per-table spec format

Keep each entry to ~15 lines. Schema intent only.

```
### `table_name`

Purpose: one sentence.
Tags: …
Mutability: who may create / update / end rows (role-level, not code paths).
Columns: domain fields + lifecycle/audit fields justified by tags.
DB rules: triggers, key constraints, FKs.
Bootstrap: yes/no — if yes, which bootstrap module (not how it runs).
```

---

### `users`

**Purpose:** Global identity for all actors; auth credentials, profile, onboarding, active workspace pointer.

**Tags:** identity root · mutable · soft-delete · `user_type` (`regular` | `demo` | `system`)

**Mutability:** Self-service signup creates rows; user updates own profile/onboarding; platform admin may deactivate.

**Columns:**

- Identity: `id`, `email`, `password` (nullable pre-invite), names, phone, avatars
- Auth/onboarding: `email_verified_at`, `onboarding_state`
- Context: `last_active_company_id` → `companies`
- Kind: `user_type`
- Lifecycle: `created_at`, `updated_at`, `is_deleted`, `deleted_at`
- Omit: `created_by_id`, `updated_by_id` (identity root)

**DB rules:** `updated_at` trigger; FK on `last_active_company_id` (deferred until `companies` exists).

**Bootstrap:** yes → `bootstrap/000-users.ts` (admin + system users). Not in migration.
