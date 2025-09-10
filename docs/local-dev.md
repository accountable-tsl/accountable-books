# Local Development Setup

## Overview

This project uses a **hybrid development approach**:

- **Infrastructure** (Database + Redis) runs in Docker containers
- **Applications** (API, Web, ML Engine) run directly on your host via Turbo

This gives you the benefits of consistent infrastructure with the speed and flexibility of host-based development.

## Prerequisites

- **Node.js** >= 20.0.0 < 24.4.0
- **pnpm** >= 8.0.0
- **Docker** & **Docker Compose**

### Setup Options

**Option 1: lvh.me (Default - Recommended)**

Update your `/etc/hosts` file:

```bash
sudo nano /etc/hosts

# Add:
127.0.0.1 app.lvh.me
127.0.0.1 api.lvh.me
```

**Option 2: localhost**

If you prefer localhost, after running `make dev-setup`, update:

```bash
# In apps/api/.env.local:
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173
COOKIE_DOMAIN=localhost

# In apps/web/.env.local:
VITE_BACKEND_URL=http://localhost:5000
```

## Quick Start

**3 commands to get started:**

```bash
# 1. Start infrastructure (DB + Redis)
docker compose -f docker-compose.dev.yml up -d

# 2. Install dependencies
pnpm install

# 3. Start all apps
pnpm dev
```

**Or use Make shortcuts:**

```bash
# Setup everything (infra + deps + migrations)
make dev-setup

# Start all apps
make dev

# Full setup including demo seeds
make dev-full
```

## Access URLs

**Default (lvh.me):**

- **🌐 Web App**: http://app.lvh.me:5173
- **🔌 API**: http://api.lvh.me:5000
- **🤖 ML Engine**: http://localhost:8000
- **📊 Admin Panel**: http://api.lvh.me:5000/admin/queues
- **📄 API Docs**: http://api.lvh.me:5000/docs

**If using localhost option:**

- **🌐 Web App**: http://localhost:5173
- **🔌 API**: http://localhost:5000
- **🤖 ML Engine**: http://localhost:8000
- **📊 Admin Panel**: http://localhost:5000/admin/queues
- **📄 API Docs**: http://localhost:5000/docs

## Demo Credentials

Use these credentials to log in:

### Demo Users

- **Email**: `demo.us@example.com` | **Password**: `StrongDemoPass!`
- **Email**: `demo.ng@example.com` | **Password**: `StrongDemoPass!`

### Admin User

- **Email**: `support@getaccountable.com` | **Password**: `StrongAdminPass!`

## Why Hybrid Development?

We use **infrastructure in Docker + apps on host** because:

1. **Consistent Infrastructure**: Everyone gets the same DB and Redis setup
2. **Fast Development**: Apps run directly on host with immediate hot reload
3. **Turbo Benefits**: Full monorepo optimization, intelligent caching, parallel execution
4. **Easy Debugging**: Direct access to Node.js processes, no container complexity

## Individual Service Development

Start specific services after running `make dev-setup`:

```bash
# Start individual apps
make dev-api      # API only
make dev-web      # Web app only
make dev-ml       # ML engine only

# Or with pnpm directly
pnpm -F @accountable-books/api dev
pnpm -F @accountable-books/web dev
pnpm -F @accountable-books/ml-engine dev
```

## Troubleshooting

### Application Issues

If apps aren't starting properly:

1. Make sure infrastructure is running: `docker compose -f docker-compose.dev.yml ps`
2. Check that dependencies are installed: `pnpm install`
3. Verify database migrations: `make db-dev-migrate`
4. Check individual app logs in your terminal

### Port Conflicts

If ports are already in use:

```bash
# Stop infrastructure
make db-dev-down

# Stop any running apps (Ctrl+C in terminal)
# Then restart infrastructure
make db-dev-up
```

### Database Issues

```bash
# Check database status
make db-dev-status

# Run migrations manually
make db-dev-migrate

# Reset database completely
make db-dev-nuke && make db-dev-up

# Apply demo seeds
make demo-apply
```

## Development Commands

**Infrastructure:**

```bash
# View infrastructure logs
make db-dev-logs

# Restart infrastructure
make db-dev-restart

# Stop infrastructure
make db-dev-down

# Check infrastructure status
make db-dev-status
```

**Applications:**

```bash
# Start all apps (after dev-setup)
make dev

# Start individual apps
make dev-api
make dev-web
make dev-ml

# Stop apps: Ctrl+C in terminal where they're running
```

## Environment Variables

Environment files are automatically generated in:

- `apps/api/.env.local`
- `apps/web/.env.local`

Key settings for development:

- `NODE_ENV=local`
- `DB_HOST=localhost` (Docker port forwarded)
- `DB_PORT=5433`
- `REDIS_HOST=localhost`
- `REDIS_PORT=6380`

## Demo Data

Apply demo seeds for testing:

```bash
# Apply all demo data
make demo-apply

# Country-specific
make demo-apply ARGS="--country US"

# View current demo data
make demo-status

# Reset demo data
make demo-reset ARGS="--all"
```

**Demo Users:**

- Email: `demo.us@example.com` | Password: `StrongDemoPass!`
- Email: `demo.ng@example.com` | Password: `StrongDemoPass!`

## Staging vs Development

**Development (this guide):**

- Infrastructure: Docker containers
- Apps: Run on host via Turbo
- Fast iteration, debugging

**Staging:**

- Everything: Docker containers
- Production-like environment
- Use `make staging-*` commands
