# Accountable Books

> **AI-native accounting platform for accounting firms**

Accountable Books is the MVP of our AI-native accounting suite. We ingest bank data, auto-categorize transactions with explainability, draft journals & financials, and provide human review workflows for exceptions.

## 🚀 Quick Start

```bash
# One-command setup (installs deps, starts database, runs migrations)
make setup

# Start development
make dev

# See all available commands
make help
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

| Command           | Description                               |
| ----------------- | ----------------------------------------- |
| `make setup`      | Complete development environment setup    |
| `make dev`        | Start all development servers (API + Web) |
| `make api-dev`    | Start API server only                     |
| `make web-dev`    | Start web app only                        |
| `make db-migrate` | Run database migrations                   |
| `make db-shell`   | Connect to database                       |
| `make test`       | Run all tests                             |
| `make check`      | Run linting, typechecking, formatting     |
| `make clean`      | Clean all containers and generated files  |

### Database Management

```bash
make db-up          # Start database
make db-migrate     # Run migrations
make db-rollback    # Rollback last migration
make db-seed        # Seed with test data
make db-logs        # View database logs
make db-shell       # Connect to database shell
```

### Web App Development

```bash
make web-dev        # Start web app development server
make web-build      # Build web app for production
make web-test       # Run web app tests
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

- **Node.js** >= 18.0.0 < 24.4.0
- **pnpm** >= 8.0.0
- **Docker** & **Docker Compose**
- **Make** (for development commands)

## 🚦 Getting Started

1. **Clone and setup:**

   ```bash
   git clone <repo-url>
   cd accountable-books
   make setup
   ```

2. **Start developing:**

   ```bash
   make dev
   ```

3. **Access services:**
   - API: http://localhost:5000
   - Web App: http://localhost:5173  
   - Database: localhost:5433
   - Redis: localhost:6380
   - API Docs: http://localhost:5000/docs
   - Bull Board: http://localhost:5000/admin/queues

## 📚 Documentation

- **[API Development Guide](apps/api/README.md)** - Backend development, database, testing
- **[Web App Development Guide](apps/web/README.md)** - Frontend development, components, styling
- **[Environment Variables](docs/ENVIRONMENT.md)** - Configuration guide for all environments
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** - Common issues and solutions

## 🔧 Environment Setup

The `make setup` command automatically:
- ✅ Creates `.env.local` files from `.env.example` templates
- ✅ Installs all dependencies
- ✅ Starts database services
- ✅ Runs database migrations

**Most configuration works out-of-the-box for local development.** 

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
