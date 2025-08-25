# Accountable Books

> **AI-native accounting platform for accounting firms**

Accountable Books is the MVP of our AI-native accounting suite. We ingest bank data, auto-categorize transactions with explainability, draft journals & financials, and provide human review workflows for exceptions.

## 🚀 Quick Start

**3 commands to get started:**

```bash
# 1. Start infrastructure (DB + Redis)
docker compose -f docker-compose.dev.yml up -d

# 2. Install dependencies
pnpm install

# 3. Start all apps with Turbo
pnpm dev
```

**Or use Make shortcuts:**

```bash
# Setup infrastructure + dependencies + migrations (no apps)
make dev-setup

# Start all apps (Turbo orchestration)
make dev

# Full setup: infra + deps + migrations + seeds + start apps  
make dev-full
```

## 🏗️ Architecture

- **API**: Node.js/Express/Knex/TypeScript
- **Web**: React/TypeScript/Vite
- **ML Engine**: Python/FastAPI _(coming soon)_
- **Database**: PostgreSQL with vector extensions
- **Deployment**: Fly.io + Neon + Vercel + Cloudflare CDN

## 📁 Project Structure

```
apps/
├── api/          # Node.js backend
├── web/          # React frontend
└── ml-engine/    # Python ML service (planned)

packages/
├── contracts/    # OpenAPI specs & generated types
├── infra/        # Shared infra logic
├── ui/          # Shared components (planned)
└── utils/       # Shared utilities (planned)

infra/
└── postgres/     # Custom PostgreSQL with extensions
```

## 🛠️ Development

### Core Commands

**Development:**
- `make dev-setup`: start infrastructure, run migrations, install dependencies (no apps)
- `make dev`: start all apps via Turbo orchestration
- `make dev-full`: complete setup (infra + deps + migrations + seeds + start apps)
- `make dev-api`: start API only
- `make dev-web`: start Web app only  
- `make dev-ml`: start ML engine only

**Quality & Testing:**
- `make test`: run all tests
- `make check`: lint + typecheck + format check
- `make ci`: check + tests

**Database:**
- `make db-shell`: open psql shell into Postgres
- `make demo-apply`: apply demo seeds

### Database Management

```bash
make db-dev-up                  # Start infrastructure (DB + Redis)
make db-dev-migrate             # Run migrations
make demo-apply                 # Apply demo seeds  
make demo-apply ARGS="--country US"  # Apply specific seeds
make db-dev-rollback            # Roll back last migration
make db-dev-logs                # View database logs
make db-shell                   # Connect to database shell
```

Seed parameters examples:

```bash
# All seeds (default)
make demo-apply

# Country-specific
make demo-apply ARGS="--country NG"

# Company type specific
make demo-apply ARGS="--type business"

# Delete and recreate
make demo-reset ARGS="--country US"
```

### Individual Service Development

```bash
# Start individual services (after running dev-setup)
make dev-api        # Start API development server
make dev-web        # Start web app development server  
make dev-ml         # Start ML engine development server

# Build and test
make build          # Build all packages
make test           # Run all tests
```

### Package Scripts (via pnpm/turbo)

```bash
pnpm dev           # Start all development servers
pnpm build         # Build all packages
pnpm test          # Run all tests
pnpm lint          # Lint all code
pnpm typecheck     # Type check all packages
```

## 🗄️ Database

PostgreSQL 17.5 with custom extensions:

- **pgvector** - Vector embeddings for ML-based categorization
- **pg_cron** - Scheduled tasks
- **pg_uuidv7** - Better UUID generation
- **pg_trgm** - Fuzzy text search
- **pgcrypto, citext, unaccent** - Standard extensions

## 🔧 Prerequisites

- **Node.js** >= 20.0.0 < 24.4.0 (see `engines` in package.json)
- **pnpm** >= 8.0.0
- **Docker** & **Docker Compose**
- **Make** (for development commands)

### Local Development Options

**Option 1: Use lvh.me (Recommended)**

Add these entries to your `/etc/hosts` file for multi-tenant features:

```bash
sudo nano /etc/hosts

# Add these lines:
127.0.0.1 app.lvh.me
127.0.0.1 api.lvh.me
127.0.0.1 *.lvh.me
```

**Option 2: Use localhost**

If you prefer localhost, update the environment files:

```bash
# In apps/api/.env.local, change:
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173
COOKIE_DOMAIN=localhost

# In apps/web/.env.local, change:
VITE_BACKEND_URL=http://localhost:5000
```

**lvh.me Benefits:** 
- Proper cookie sharing between API and Web app
- Multi-tenant subdomain testing (e.g., `firm1.app.lvh.me:5173`)
- No environment file changes needed

## 🚦 Getting Started

1. **Clone and setup:**

   ```bash
   git clone <repo-url>
   cd accountable-books
   make dev-setup
   ```

2. **Start developing:**

   ```bash
   make dev
   ```

3. **Access services:**
   - **Web App**: http://app.lvh.me:5173
   - **API**: http://api.lvh.me:5000
   - **ML Engine**: http://localhost:8000
   - **Database**: localhost:5433 (PostgreSQL)
   - **Redis**: localhost:6380
   - **API Docs**: http://api.lvh.me:5000/docs
   - **Admin Panel**: http://api.lvh.me:5000/admin/queues

## 📚 Documentation

- **[API Development Guide](apps/api/README.md)** - Backend development, database, testing
- **[Web App Development Guide](apps/web/README.md)** - Frontend development, components, styling
- **[Environment Variables](docs/ENVIRONMENT.md)** - Configuration guide for all environments
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** - Common issues and solutions

## 🔒 Production Guard (Safety)

Destructive or state-changing targets are protected by a guard and refuse to run in production-like contexts.

Guarded targets include: `db-*` (except `db-logs`/`db-shell`), `demo-*` (except `demo-list`/`demo-status`), `clean`, `clean-all`, `reset`.

The guard blocks when any of the following is true:

- `APP_ENV=production`, or `NODE_ENV=production`
- running in popular PaaS contexts (e.g. `FLY_APP_NAME`, `VERCEL` envs detected)

Override locally by ensuring: `APP_ENV=local` and `NODE_ENV` unset or non-production.

Examples:

```bash
# Will refuse (production-like)
make db-setup APP_ENV=production

# Local safe run
make db-setup APP_ENV=local
```

For production or custom setups, see the [Environment Variables Guide](docs/ENVIRONMENT.md).

## 🚨 Troubleshooting

**Having issues?** Check our [Troubleshooting Guide](docs/TROUBLESHOOTING.md) for solutions to common problems:

- Docker/Database connection issues
- Port conflicts
- Node.js version problems
- Permission errors
- Build failures

**Quick fix for most issues:**

```bash
make clean-all  # Nuclear reset - removes everything and reinstalls
```

## 🏢 Non-Negotiables

1. **Accuracy** - Financial data must be precise
2. **Explainability** - AI decisions must be traceable
3. **Auditability** - Complete audit trail required

## 📏 Development Principles

**Priority Order**: Quality → Readability → Simplicity → Performance

- Design first; avoid "clever" solutions
- Measure before optimizing
- Feature-first folder structure
- Add tests as necessary (no unnecessary tests)

## 🔧 Development Workflow

### Git Hooks (Automated Quality Checks)

Git hooks are automatically configured to ensure code quality:

**Pre-commit hooks** (run automatically on `git commit`):

- ✅ **Lint & format** changed files (ESLint + Prettier)
- ✅ **Validate OpenAPI contracts** if changed
- ✅ **Bundle contracts** and add generated files to commit

**Pre-push hooks** (run automatically on `git push`):

- ✅ **Type checking** across all packages
- ✅ **Run tests** to ensure nothing is broken
- ✅ **Build verification** to catch build issues

### Manual Quality Checks

Run these commands manually when needed:

```bash
make check      # Full quality check (lint, typecheck, format)
make test       # Run all tests
make build      # Build all packages
make contracts  # Validate, bundle, and generate types from OpenAPI
```

## 🤝 Contributing

### Development Process

1. **Clone and setup**:

   ```bash
   git clone <repo-url>
   cd accountable-books
   make setup
   ```

2. **Create feature branch**:

   ```bash
   git checkout -b feature/my-feature
   ```

3. **Develop with confidence**:
   - Git hooks prevent broken commits/pushes
   - Use `make dev` for development with hot reload
   - Follow existing code patterns and conventions

4. **Quality is enforced automatically**:
   - Pre-commit: Linting, formatting, contract validation
   - Pre-push: Tests, type checking, build verification
   - No manual `make check` needed (but still available)

### Code Standards

- **Follow existing patterns** in the codebase
- **TypeScript strict mode** - no `any` types
- **Feature-first organization** - group related code together
- **Write tests** for new functionality
- **Update documentation** for significant changes
- **Clear commit messages** following conventional commits

## 📜 License

Proprietary - Accountable Techserve Inc.

---

**Made with ❤️ by the Accountable Books team**
