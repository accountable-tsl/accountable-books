# Accountable Books - AI Assistant Context

## Project Vision

Accountable Books is the MVP of an AI-native accounting platform for accounting firms. This is our wedge product - the first in a suite of AI-native accounting tools.

**Core Features:**

- Ingest bank data (Plaid/US, Mono/Nigeria, CSV uploads)
- Auto-categorize transactions (modified accrual/cash basis)
- Generate journals & financials (IFRS/US GAAP) with explainability
- Human review workflow for exceptions

## Architecture

- **API**: Node.js/Express/Knex/TypeScript
- **Web**: React/TypeScript/Vite
- **ML Engine**: Python/FastAPI (not yet implemented)
- **Database**: PostgreSQL (Neon in production)
- **Deployment**: Fly.io (services) + Neon + Vercel + Cloudflare CDN

## Current State

- ✅ Backend imported and running in monorepo
- 🔄 Frontend migration in progress
- ⏳ Python ML engine to be added
- 📁 Monorepo with Turborepo + pnpm workspaces
- 🔗 Shared types via OpenAPI in `/packages/contracts`

## Non-Negotiables

1. **Accuracy** - Financial data must be precise
2. **Explainability** - AI decisions must be traceable
3. **Auditability** - Complete audit trail required

## Development Principles

**Priority Order**: Quality → Readability → Simplicity → Performance

- Design first; avoid "clever" solutions
- Measure before optimizing
- Favor: data locality, incremental work, smart caching, coarse-grained memoization
- Add tests as necessary (no unnecessary tests)
- Clear names, functions, good commentary
- Feature-first folder structure
- Great user experiences overall

## ML Guidelines

- Versioned models
- Immutable prediction records (features, output, confidence, explanation pointer)
- Deterministic seeds in tests

## Code Organization

apps/
├── api/ # Node.js backend
├── web/ # React frontend
└── ml-engine/ # Python ML service
packages/
├── contracts/ # OpenAPI specs & generated types
├── infra/ # Shared infra logic
├── ui/ # Shared components
└── utils/ # Shared utilities

## Important Context

We're migrating from separate repos, so integration work is ongoing. Focus on doing things right going forward rather than perfect consistency with legacy code.
