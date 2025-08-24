# Local Development Setup

## Overview

This project uses `lvh.me` domains for local development to support multi-tenant features and subdomain testing. The `lvh.me` domain resolves to `127.0.0.1` (localhost) but allows for proper cookie sharing and subdomain testing.

## Quick Start

```bash
# Start the complete development environment
make dev-full

# Or start step by step
make dev-up
make dev-wait-services
make dev-db-setup
make dev-health-check
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

```bash
# View logs
make dev-logs

# Restart services
make dev-restart

# Stop services
make dev-stop

# Check status
make dev-status

# Clean restart (rebuild containers)
make dev-clean
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
