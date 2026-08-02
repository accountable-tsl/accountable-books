# Monorepo Day-Zero Rules (Go + 2 React Apps + Python)

This is a “set it once” rulebook for keeping a monorepo clean long-term. The goal is **clarity of ownership**, **enforced boundaries**, and **one source of truth** for contracts.

## 1) Repository Shape (Non-Negotiable)

```
.
├─ apps/
│  ├─ web/                 # React app 1
│  └─ admin/               # React app 2
├─ services/
│  ├─ api/                 # Go HTTP API (or multiple Go services)
│  └─ workers/             # Python app (jobs, ML, ETL, etc.)
├─ packages/
│  ├─ ui/                  # Design system (shared components + tokens)
│  ├─ auth-web/            # Auth UI + hooks for React
│  ├─ api-client/          # Generated TS client (from contracts)
│  ├─ config/              # Shared config helpers (TS only)
│  └─ utils/               # Shared utilities (small, opinionated)
├─ contracts/
│  ├─ http/                # OpenAPI specs for HTTP APIs
│  └─ events/              # JSON Schema (or Protobuf) for events/messages
├─ infra/                  # Terraform/Pulumi, deployment, etc.
├─ tools/                  # Codegen, scripts, repo tooling
└─ docs/                   # Architecture decisions (ADRs), runbooks
```

Rule: `apps/*` and `services/*` are **thin**. Most reusable code goes in `packages/*`.

## 2) Dependency Boundaries (Enforced)

Rule: **No cross-app imports**. `apps/web` cannot import from `apps/admin`.

Rule: **Allowed direction**

- `apps/*` can import from `packages/*`.
- `services/*` can import from `contracts/*` (generated code) and their own internal modules.
- `packages/*` can import from other `packages/*` only if it doesn’t create cycles and respects layers.

Rule: **Layering inside packages (simple)**

- `packages/ui` depends on nothing app-specific.
- `packages/auth-web` may depend on `packages/api-client` and `packages/ui`, not on apps.
- `packages/api-client` is generated; it depends on minimal runtime helpers only.

Enforcement:

- TS/ESLint: import restrictions for `apps/*` and `packages/*`.
- Go: `depguard` / `golangci-lint` rules for internal boundaries.
- Python: keep imports within the service package; lint for forbidden imports.

## 3) Where Auth Lives

Auth is split by responsibility.

Backend (Go):

- Auth verification, session issuance, middleware, RBAC/ABAC live in `services/api/internal/auth`.
- If you have multiple services, put shared auth logic in a Go module used by services, but keep it service-owned (not a “global dumping ground”).

Frontend (React):

- Auth UX + hooks + token/session handling live in `packages/auth-web`.
- Apps call `packages/auth-web` for `useSession()`, `requireAuth()`, route guards, etc.

Contracts:

- Auth-related HTTP endpoints and schemas live in `contracts/http/*`.
- `packages/api-client` is generated from the contracts and used by `packages/auth-web`.

Rule: apps never implement auth logic ad-hoc; they consume `packages/auth-web`.

## 4) Where the Design System Lives

Design system lives in `packages/ui`.

Contents:

- Components (wrappers around Radix/shadcn or your own primitives)
- Tokens (colors, typography, spacing)
- Styling utilities (cn, variants)
- App-agnostic patterns (CommandBar primitives, Chip, Badge, EmptyState)

Rule:

- `packages/ui` must not import from `apps/*`.
- Domain components (like “JournalEntryCard”) belong in the domain package or the app, not in `packages/ui`.

## 5) Contracts: OpenAPI vs JSON Schema vs Protobuf (Pick on Day 0)

You can use any of these well. The important part is: **one source of truth** and **generated clients**.

Recommended default for this stack:

- **HTTP APIs:** OpenAPI in `contracts/http/*`
- **Events/messages (queues, pubsub):** JSON Schema in `contracts/events/*`

When Protobuf is the better choice:

- You’re doing **gRPC** between services.
- You need **strict binary compatibility** and strong tooling around schema evolution.
- You have a heavy streaming/low-latency use case.

Rule:

- Don’t handwrite clients. Generate:
  - Go server types/handlers stubs from OpenAPI (or at least types).
  - TS client for React from OpenAPI.
  - Python client/models from OpenAPI.

## 6) Where Zod Fits

Zod is great for **runtime validation in TypeScript**. It should not become your cross-language source-of-truth by default.

Recommended rule:

- Source-of-truth stays in `contracts/` (OpenAPI / JSON Schema / Protobuf).
- Zod can be:
  - Generated from OpenAPI schemas for frontend runtime validation.
  - Used locally at UI boundaries (forms) as long as it mirrors contract models, not replaces them.

Avoid:

- Using Zod as the canonical API schema if Go + Python must also stay in sync.

## 7) Configuration and Secrets (One Way Only)

Rule:

- `.env` is for local dev only.
- Typed config loaders per language.
- Document all config keys in one place (`docs/config.md` or generated output).

## 8) Testing Strategy (Minimal but Complete)

Rule:

- Unit tests for packages (fast).
- Contract tests validate OpenAPI examples and backwards compatibility.
- Integration tests run via one harness (Docker Compose or testcontainers).

Rule:

- CI runs `lint`, `typecheck`, `unit`, `integration` as separate jobs.

## 9) Formatting and Linting (Auto-Enforced)

Rule:

- Go: `gofmt`, `golangci-lint`
- TS: `eslint` + `prettier`
- Python: `ruff` (+ `black` if you want, but ruff can format too)

Rule:

- Pre-commit hooks are optional; CI is mandatory.

## 10) “No Temporary Folders Without an Exit”

If you create a transitional area (example: `*-pending-migration`):

- Add a `docs/adr/*` entry explaining why it exists.
- Add a checklist for removal.
- Add an import boundary so new code can’t depend on it.

## 11) “Thin Apps, Fat Packages” Rule

Rule:

- `apps/*` contains routing, composition, and UI assembly.
- `packages/*` contains reusable, testable logic and components.
- `services/*` contains orchestration and service-specific business logic.

## Day-Zero Checklist

- Create folders exactly as above.
- Add boundary lint rules for TS + Go + Python.
- Add `contracts/` with a “hello world” OpenAPI spec and generate all clients from it.
- Add `packages/ui` and make both React apps use it on the first screen.
- Add `packages/auth-web` and make both apps use the same auth gate/hook.
- Add one top-level command runner (`make`/`just`) with: `lint`, `test`, `build`, `dev`.
