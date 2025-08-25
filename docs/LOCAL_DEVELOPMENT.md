# Local Development Setup

## Overview

This project uses `lvh.me` domains for local development to support multi-tenant features and subdomain testing. The `lvh.me` domain resolves to `127.0.0.1` (localhost) but allows for proper cookie sharing and subdomain testing.

## Quick Start

### Development with Turbo (Recommended)

```bash
# Start the complete development environment
pnpm dev

# Or start step by step
make dev-up
make dev-wait-services
make dev-db-setup
make dev-health-check
```

### Containerized Development (Alternative)

```bash
# Start the complete development environment
pnpm dev:docker
# or
make dev-full
```

### Local Development (Alternative)

```bash
# Start database only
make db-dev-up

# Start services locally
pnpm dev
```

## Access URLs

Once the environment is running, access the applications at:

- **🌐 Frontend (Web App)**: http://app.lvh.me:5173
- **🔌 Backend (API)**: http://api.lvh.me:5000
- **🤖 ML Engine**: http://localhost:8000
- **📊 Bull Board (Admin)**: http://api.lvh.me:5000/admin/queues

## Demo Credentials

Use these credentials to log in:

### Demo Users

- **Email**: `demo.us@example.com` | **Password**: `StrongDemoPass!`
- **Email**: `demo.ng@example.com` | **Password**: `StrongDemoPass!`

### Admin User

- **Email**: `support@getaccountable.com` | **Password**: `StrongAdminPass!`

## Why lvh.me?

We use `lvh.me` instead of `localhost` because:

1. **Subdomain Testing**: Allows testing multi-tenant features with subdomains like:
   - `firm1.app.lvh.me:5173`
   - `firm2.app.lvh.me:5173`
   - `us-demo.app.lvh.me:5173`

2. **Cookie Sharing**: Proper cookie domain sharing between `api.lvh.me` and `app.lvh.me`

3. **Consistent Environment**: All developers get the same setup without configuration

## Subdomain Testing

For testing different firms and multi-tenant features:

```bash
# Test different firm subdomains
http://us-demo.app.lvh.me:5173
http://ng-demo.app.lvh.me:5173
http://firm-slug.app.lvh.me:5173
```

## Troubleshooting

### Login Issues

If you're getting logged out immediately:

1. Make sure you're using `app.lvh.me:5173` (not `localhost:5173`)
2. Check that the API is accessible at `api.lvh.me:5000`
3. Clear browser cookies for the domain

### Port Already in Use

If ports are already in use:

```bash
# Stop all containers
make dev-down

# Clean restart
make dev-clean
```

### Database Issues

```bash
# Reset database
make db-reset

# Or clean restart everything
make dev-clean
```

## Development Commands

### Turbo Commands (Recommended)

```bash
# Start development
pnpm dev                  # Start with Turbo (recommended)
pnpm dev:docker          # Start in containers

# Testing
pnpm test                # Run tests with Turbo
pnpm test:docker         # Run tests in containers

# Linting
pnpm lint                # Run linting with Turbo
pnpm lint:docker         # Run linting in containers
pnpm lint:fix            # Fix linting issues with Turbo
pnpm lint:fix:docker     # Fix linting issues in containers

# Type checking
pnpm typecheck           # Run type checking with Turbo
pnpm typecheck:docker    # Run type checking in containers

# Database operations
make api-dev-migrate     # Run migrations
make api-dev-seed        # Apply demo data
make db-dev-reset        # Reset database

# Service management
make dev-logs            # View logs
make dev-restart         # Restart services
make dev-stop            # Stop services
make dev-status          # Check status
make dev-clean           # Clean restart
```

### Individual Service Commands

```bash
# API operations
make api-dev-up          # Start API
make api-dev-down        # Stop API
make api-dev-logs        # API logs
make api-dev-test        # API tests
make api-dev-lint        # API linting

# Web operations
make web-dev-up          # Start Web app
make web-dev-down        # Stop Web app
make web-dev-logs        # Web logs
make web-dev-test        # Web tests
make web-dev-lint        # Web linting

# Database operations
make db-dev-up           # Start database
make db-dev-down         # Stop database
make db-dev-logs         # Database logs
make db-dev-nuke         # Destroy database
```

## Environment Variables

The environment is pre-configured for `lvh.me` domains in:

- `apps/api/.env.local`
- `apps/web/.env.local`

Key settings:

- `BACKEND_URL=http://api.lvh.me:5000`
- `FRONTEND_URL=http://app.lvh.me:5173`
- `COOKIE_DOMAIN=.lvh.me`

## Adding to /etc/hosts (Optional)

For even better subdomain support, you can add to your `/etc/hosts`:

```bash
# Add these lines to /etc/hosts
127.0.0.1 app.lvh.me
127.0.0.1 api.lvh.me
127.0.0.1 *.lvh.me
```

This ensures all subdomains resolve properly.

## Migration to Turbo-First Development

### What Changed

We've migrated to a Turbo-first development approach that leverages Turbo's benefits while maintaining container support:

**Before:**

- Mixed local and Docker commands
- Inconsistent environments across developers
- Manual task orchestration

**After:**

- `pnpm dev` uses Turbo for smart task orchestration
- Turbo handles parallel execution and caching
- Container alternatives available with `:docker` suffix
- Consistent environment for all developers

### Command Mapping

| Command          | Turbo (Recommended) | Container Alternative   |
| ---------------- | ------------------- | ----------------------- |
| `pnpm dev`       | `pnpm dev`          | `pnpm dev:docker`       |
| `pnpm test`      | `pnpm test`         | `pnpm test:docker`      |
| `pnpm lint`      | `pnpm lint`         | `pnpm lint:docker`      |
| `pnpm typecheck` | `pnpm typecheck`    | `pnpm typecheck:docker` |

### Benefits

1. **Consistency**: All developers get the same environment
2. **Isolation**: No conflicts with local Node.js versions or dependencies
3. **Reproducibility**: Exact same setup as production
4. **Simplicity**: One command (`pnpm dev`) sets up everything
5. **Multi-tenant Testing**: Proper subdomain support with `lvh.me`

### Troubleshooting

If you encounter issues with the containerized setup:

1. **Use local alternatives**: Add `:local` to any command
2. **Check container status**: `make dev-status`
3. **Restart containers**: `make dev-restart`
4. **Clean restart**: `make dev-clean`
5. **View logs**: `make dev-logs`
