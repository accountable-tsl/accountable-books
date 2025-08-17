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
- **Web**: React/TypeScript/Vite *(coming soon)*
- **ML Engine**: Python/FastAPI *(coming soon)*
- **Database**: PostgreSQL with vector extensions
- **Deployment**: Fly.io + Neon + Vercel + Cloudflare CDN

## 📁 Project Structure

```
apps/
├── api/          # Node.js backend
├── web/          # React frontend (planned)
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

| Command | Description |
|---------|-------------|
| `make setup` | Complete development environment setup |
| `make dev` | Start development servers |
| `make db-migrate` | Run database migrations |
| `make db-shell` | Connect to database |
| `make test` | Run all tests |
| `make check` | Run linting, typechecking, formatting |
| `make clean` | Clean all containers and generated files |

### Database Management

```bash
make db-up          # Start database
make db-migrate     # Run migrations
make db-rollback    # Rollback last migration
make db-seed        # Seed with test data
make db-logs        # View database logs
make db-shell       # Connect to database shell
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
   - API: http://localhost:3000
   - Database: localhost:5433
   - Redis: localhost:6380

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

## 🤝 Contributing

1. Follow the existing code style
2. Run `make check` before committing
3. Write clear commit messages
4. Update docs when needed

## 📜 License

Proprietary - Accountable Techserve Inc.

---

**Made with ❤️ by the Accountable Books team**
