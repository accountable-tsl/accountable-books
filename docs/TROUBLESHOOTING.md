# Troubleshooting Guide

Common issues and solutions for Accountable Books development.

## Quick Fixes

### 🔄 Nuclear Reset

If things are completely broken, try a full reset:

```bash
make clean-all  # Nuclear cleanup: removes deps/caches and reinstalls from lockfile
```

### 🧹 Partial Reset

For less dramatic issues:

```bash
make clean      # Clean Docker containers and generated files
make setup      # Re-setup environment
```

## Setup Issues

### ❌ `make setup` fails with permission errors

**Problem**: Docker permission denied errors on Linux/WSL

**Solutions**:

1. Add your user to the docker group:

   ```bash
   sudo usermod -aG docker $USER
   # Log out and back in
   ```

2. Or run with sudo (not recommended):
   ```bash
   sudo make setup
   ```

### ❌ `pnpm install` fails with network errors

**Problem**: Package installation fails behind corporate firewall

**Solutions**:

1. Configure pnpm registry:

   ```bash
   pnpm config set registry https://registry.npmjs.org/
   ```

2. Check corporate proxy settings:
   ```bash
   npm config list
   pnpm config list
   ```

### ❌ `make setup` hangs on "Waiting for database"

**Problem**: Database never becomes ready

**Solutions**:

1. Check Docker logs:

   ```bash
   make db-logs
   ```

2. Ensure Docker has enough resources:
   - Docker Desktop: Increase memory to 4GB+
   - Check available disk space

3. Restart Docker completely:
   ```bash
   make db-down
   docker system prune -f
   make db-up
   ```

## Database Issues

### ❌ Connection refused to database

**Problem**: `ECONNREFUSED localhost:5433`

**Root Cause**: Database service not running or not ready

**Solutions**:

1. Check if database is running:

   ```bash
   docker ps | grep accountable-books-db
   ```

2. Start database services:

   ```bash
   make db-up
   sleep 10  # Wait for startup
   ```

3. Check database logs:
   ```bash
   make db-logs
   ```

### ❌ Migration fails with "relation already exists"

**Problem**: Migrations fail because tables already exist

**Solutions**:

1. Check migration status:

   ```bash
   make db-shell
   \dt  -- List tables
   \q   -- Exit
   ```

2. Reset database completely:
   ```bash
   make db-down
   docker volume rm accountable-books_postgres_data
   make db-up
   sleep 10
   make db-migrate
   ```

### ❌ Database connection works but queries fail

**Problem**: Database connected but missing extensions or data

**Solutions**:

1. Ensure migrations ran successfully:

   ```bash
   make db-migrate
   ```

2. Check database has required extensions:
   ```bash
   make db-shell
   SELECT * FROM pg_extension;
   \q
   ```

## Port Conflicts

### ❌ Port already in use errors

**Problem**: `Error: listen EADDRINUSE :::5433`

**Solutions**:

1. Find what's using the port:

   ```bash
   # On macOS/Linux
   lsof -i :5433
   lsof -i :6380
   lsof -i :5000
   lsof -i :5173

   # On Windows
   netstat -ano | findstr :5433
   ```

2. Stop conflicting services:

   ```bash
   # Kill specific process by PID
   kill <PID>

   # Or stop common conflicting services
   brew services stop postgresql  # If you have local Postgres
   brew services stop redis       # If you have local Redis
   ```

3. Change ports in configuration:
   - Edit `docker-compose.dev.yml` for database/Redis
   - Edit `.env.local` files for API/Web ports

## API Issues

### ❌ API returns 500 errors on startup

**Problem**: Internal server errors when making requests

**Solutions**:

1. Check API logs:

   ```bash
   pnpm --filter @accountable-books/api dev
   # Look for error messages
   ```

2. Verify environment variables:

   ```bash
   cat apps/api/.env.local
   # Ensure DATABASE_URL, REDIS_URL are correct
   ```

3. Test database connection:
   ```bash
   make db-shell
   \l  -- List databases
   \c accountable_books  -- Connect to app database
   \dt  -- List tables
   ```

### ❌ CORS errors when accessing API from web app

**Problem**: Cross-origin request blocked

**Solutions**:

1. Ensure CORS configuration matches:
   - API `FRONTEND_URL` in `.env.local`
   - Web `VITE_BACKEND_URL` in `.env.local`

2. Check URLs match exactly (including http/https, ports)

## Web App Issues

### ❌ Web app shows blank page

**Problem**: React app doesn't load or shows white screen

**Solutions**:

1. Check browser console for errors (F12)

2. Verify web app is running:

   ```bash
   pnpm --filter @accountable-books/web dev
   ```

3. Check environment variables:
   ```bash
   cat apps/web/.env.local
   # Ensure VITE_BACKEND_URL is correct
   ```

### ❌ API calls fail with network errors

**Problem**: Web app can't connect to API

**Solutions**:

1. Verify API is running on correct port:

   ```bash
   curl http://localhost:5000/health/ready
   ```

2. Check environment variables match:
   - Web app: `VITE_BACKEND_URL=http://localhost:5000`
   - API: `PORT=5000`

## Node.js Issues

### ❌ `node: command not found`

**Problem**: Node.js not installed or wrong version

**Solutions**:

1. Install via **mise** (required by `make setup` / `check-prerequisites`):

   ```bash
   curl https://mise.run | sh
   mise install   # from repo root
   ```

2. Alternatives if needed:

   ```bash
   # nvm
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 24.16.0 && nvm use 24.16.0

   # Homebrew (macOS)
   brew install node@24
   ```

### ❌ `pnpm: command not found`

**Problem**: pnpm not installed (need **pnpm >= 11**)

**Solutions**:

```bash
# Preferred: mise (from repo root)
mise install

# Or install pnpm directly
npm install -g pnpm@11
# Or: brew install pnpm

pnpm --version
```

### ❌ `uv: command not found`

**Problem**: uv is required for the ML engine

**Solution**: Install from https://docs.astral.sh/uv/getting-started/installation/ then `cd apps/ml-engine && uv sync --frozen`.

### ❌ Node version conflicts

**Problem**: "engines" field mismatch errors

**Solutions**:

1. Check required Node version:

   ```bash
   cat package.json | grep -A 2 engines
   ```

2. Use correct Node version:
   ```bash
   nvm use 24.16.0  # pinned project version
   ```

## Docker Issues

### ❌ `docker: command not found`

**Problem**: Docker not installed

**Solutions**:

1. Install Docker Desktop:
   - [macOS](https://docs.docker.com/desktop/install/mac-install/)
   - [Windows](https://docs.docker.com/desktop/install/windows-install/)
   - [Linux](https://docs.docker.com/desktop/install/linux-install/)

### ❌ Docker daemon not running

**Problem**: `Cannot connect to the Docker daemon`

**Solutions**:

1. Start Docker Desktop application
2. Or start Docker service:

   ```bash
   # On Linux with systemd
   sudo systemctl start docker

   # On macOS/Windows, start Docker Desktop app
   ```

## TypeScript Issues

### ❌ Type errors in generated files

**Problem**: TypeScript compilation fails with type errors

**Solutions**:

1. Clean and rebuild:
   ```bash
   pnpm clean
   pnpm build
   ```

## Performance Issues

### ❌ Slow startup times

**Problem**: `make setup` or `make dev` takes too long

**Solutions**:

1. Increase Docker memory allocation (Docker Desktop settings)
2. Use faster package manager:
   ```bash
   pnpm config set store-dir ~/.pnpm-store
   ```
3. Enable pnpm hoisting:
   ```bash
   echo "hoist-pattern[]=*" >> .npmrc
   ```

## Getting More Help

If these solutions don't work:

1. **Check logs**: Most commands have `--verbose` or `--debug` flags
2. **Search issues**: Look in the GitHub repository issues
3. **Clean slate**: Try `make clean-all` for a completely fresh start
4. **Ask for help**: Include your OS, Node version, and error messages
