# Turbo-First Development Migration

## Overview

We've successfully migrated to a Turbo-first development approach that leverages Turbo's benefits while maintaining container support. This ensures consistency across all developers while providing the best of both worlds: Turbo's smart task orchestration and container isolation when needed.

## What Changed

### Before (Mixed Approach)

- Mixed local and Docker commands
- Inconsistent environments across developers
- Manual task orchestration
- Potential conflicts with local Node.js versions
- No leveraging of Turbo's benefits

### After (Turbo-First)

- `pnpm dev` uses Turbo for smart task orchestration
- Turbo handles parallel execution and caching
- Container alternatives available with `:docker` suffix
- Consistent environment for all developers
- Best of both worlds: Turbo + Container support

## New Command Structure

### Root Level Commands (package.json)

| Command          | Turbo (Recommended)      | Container Alternative   |
| ---------------- | ------------------------ | ----------------------- |
| `pnpm dev`       | Turbo orchestrated setup | `pnpm dev:docker`       |
| `pnpm test`      | Tests with Turbo         | `pnpm test:docker`      |
| `pnpm lint`      | Linting with Turbo       | `pnpm lint:docker`      |
| `pnpm typecheck` | Type checking with Turbo | `pnpm typecheck:docker` |
| `pnpm clean`     | Clean with Turbo         | `pnpm clean:docker`     |

### Makefile Commands

| Command                 | Description                         |
| ----------------------- | ----------------------------------- |
| `make dev-full`         | Complete containerized setup        |
| `make test`             | Run all tests with Turbo            |
| `make test-docker`      | Run all tests in containers         |
| `make lint`             | Run all linting with Turbo          |
| `make lint-docker`      | Run all linting in containers       |
| `make typecheck`        | Run all type checking with Turbo    |
| `make typecheck-docker` | Run all type checking in containers |
| `make api-dev-test`     | API tests in container              |
| `make web-dev-test`     | Web tests in container              |
| `make api-dev-lint`     | API linting in container            |
| `make web-dev-lint`     | Web linting in container            |

## Benefits

### 1. Consistency

- All developers get exactly the same environment
- No "works on my machine" issues
- Same Node.js versions, dependencies, and configurations

### 2. Isolation

- No conflicts with local Node.js installations
- Clean environment for each project
- Easy to switch between different projects

### 3. Reproducibility

- Exact same setup as staging/production
- Version-controlled environment
- Easy onboarding for new developers

### 4. Multi-tenant Testing

- Proper subdomain support with `lvh.me`
- Test firm-specific features with subdomains
- Cookie sharing works correctly

### 5. Simplicity

- One command (`pnpm dev`) sets up everything
- No manual database setup
- No manual dependency installation

## Quick Start for Developers

### New Developer Setup

```bash
# Clone the repository
git clone <repo-url>
cd accountable-books

# Install dependencies
pnpm install

# Start development environment
pnpm dev

# Access the application
# Frontend: http://app.lvh.me:5173
# Backend: http://api.lvh.me:5000
```

### Daily Development

```bash
# Start development
pnpm dev

# Run tests
pnpm test

# Run linting
pnpm lint

# Fix linting issues
pnpm lint:fix

# Type checking
pnpm typecheck
```

## Troubleshooting

### Container Issues

```bash
# Check status
make dev-status

# View logs
make dev-logs

# Restart services
make dev-restart

# Clean restart
make dev-clean
```

### Use Local Alternatives

If you encounter container issues, you can fall back to local development:

```bash
# Start database only
make db-dev-up

# Run services locally
pnpm dev:local
pnpm test:local
pnpm lint:local
```

### Common Issues

1. **Port conflicts**: Use `make dev-clean` to stop all containers
2. **Permission issues**: Ensure Docker has proper permissions
3. **Memory issues**: Increase Docker memory allocation
4. **Network issues**: Check if `lvh.me` resolves properly

## Migration Checklist

For existing developers:

- [ ] Update your workflow to use `pnpm dev` instead of local commands
- [ ] Test the new containerized setup
- [ ] Update any CI/CD scripts if needed
- [ ] Update documentation references
- [ ] Remove any local environment setup scripts

## Environment Variables

The containerized setup uses these environment files:

- `apps/api/.env.local` - API configuration
- `apps/web/.env.local` - Web app configuration

These are automatically generated and should not be committed to version control.

## Database Operations

### Containerized Database Commands

```bash
# Run migrations
make api-dev-migrate

# Apply demo data
make api-dev-seed

# Reset database
make db-dev-nuke && make db-dev-up && make api-dev-migrate && make api-dev-seed
```

### Local Database Commands (Alternative)

```bash
# Start database only
make db-dev-up

# Run migrations locally
cd apps/api && pnpm migrate:local

# Apply demo data locally
cd apps/api && pnpm demo:apply -- --all
```

## Testing Subdomains

With the containerized setup, you can test multi-tenant features:

```bash
# Test different firm subdomains
http://us-demo.app.lvh.me:5173
http://ng-demo.app.lvh.me:5173
http://firm-slug.app.lvh.me:5173
```

## Performance

The containerized setup may be slightly slower than local development due to:

- Container overhead
- Volume mounting
- Network communication between containers

However, the benefits of consistency and isolation outweigh the performance cost for most development tasks.

## Future Improvements

- [ ] Add development database snapshots
- [ ] Implement hot reload optimization
- [ ] Add development-specific Docker optimizations
- [ ] Create development environment profiles
