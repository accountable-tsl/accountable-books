.PHONY: help bootstrap dev dev-setup ci check build test clean clean-all reset
# .PHONY: db-up db-down db-restart db-wait db-prepare db-setup db-migrate db-rollback db-seed db-reset db-logs db-shell
# .PHONY: db-test-create db-test-migrate db-test-prepare
.PHONY: api-dev api-build api-test web-dev web-build web-test
.PHONY: validate-contracts bundle-contracts bundle-contracts-watch contracts-watch clean-bundled codegen contracts
.PHONY: demo-apply demo-reverse demo-reset demo-status

# Colors for output
GREEN := \033[32m
YELLOW := \033[33m
BLUE := \033[34m
RED := \033[31m
RESET := \033[0m


# Config
DOCKER_COMPOSE_DEV := docker-compose -p acct-dev -f docker-compose.dev.yml
DOCKER_COMPOSE_STAGING := docker-compose -p acct-staging -f docker-compose.staging.yml

DB_CONTAINER := books-db-dev
DB_NAME := accountable_books
DB_USER := user
APP_ENV ?= local
WAIT_TIMEOUT ?= 30
SEED_ARGS ?= --all

compose_for = \
  $(if $(filter $(1),dev),$(DOCKER_COMPOSE_DEV),\
    $(if $(filter $(1),staging stg),$(DOCKER_COMPOSE_STAGING),\
      $(error Unknown environment '$(1)'. Use dev, staging, or stg)))

# Map env → compose filename (for lazy existence checks)
file_for = $(if $(filter $(1),dev),docker-compose.dev.yml,$(if $(filter $(1),staging stg),docker-compose.staging.yml,))

.PHONY: ensure-%
ensure-%:
	@f="$(call file_for,$*)"; \
	if [ -z "$$f" ]; then echo "$(RED)Unknown environment '$*'$(RESET)"; exit 1; fi; \
	if [ ! -f "$$f" ]; then echo "$(RED)Missing $$f$(RESET)"; exit 1; fi

# Guard: prevent destructive commands in production contexts
.PHONY: guard-nonprod
guard-nonprod:
	@if [ "$(APP_ENV)" = "production" ] || [ "$(NODE_ENV)" = "production" ] || [ -n "$$FLY_APP_NAME" ] || [ -n "$$VERCEL" ]; then \
		echo "$(RED)Refusing to run this target in a production-like context.$(RESET)"; \
		echo "$(YELLOW)Hint: set APP_ENV=local (or unset NODE_ENV) to proceed locally.$(RESET)"; \
		exit 1; \
	fi

##@ Help
help: ## Display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\n$(BLUE)Usage:$(RESET)\n  make $(YELLOW)<target>$(RESET)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(YELLOW)%-18s$(RESET) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BLUE)%s$(RESET)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)


MAKEFILES_DIR := infra/makefiles
$(info Wildcard files: $(wildcard $(MAKEFILES_DIR)/*.mk))
ifneq ($(wildcard $(MAKEFILES_DIR)/*.mk),)
    include $(wildcard $(MAKEFILES_DIR)/*.mk)
else
    $(warning No .mk files found in $(MAKEFILES_DIR))
endif

##@ Bootstrap
bootstrap: ## Install deps, generate envs, and build contracts/types
	@echo "$(GREEN)Bootstrapping repository...$(RESET)"
	@echo "$(YELLOW)📦 Installing dependencies...$(RESET)"
	pnpm install
	@echo "$(YELLOW)📋 Generating environment files...$(RESET)"
	pnpm run generate-env
	@echo "$(YELLOW)📄 Contracts: validate, bundle, codegen...$(RESET)"
	$(MAKE) contracts
	@echo "$(GREEN)✅ Bootstrap complete$(RESET)"

# Back-compat alias when using this file directly
setup: bootstrap ## Alias for bootstrap (compat)

##@ Development
dev-setup: db-setup ## Prepare DB (up+wait+migrate+seed) without starting servers
	@echo "$(GREEN)✅ Development DB prepared (no servers started)$(RESET)"

dev-start: db-setup pnpm dev

dev: ## Start apps in development mode (servers only; no DB side effects)
	@echo "$(GREEN)Starting apps (no DB prep)$(RESET)"
	pnpm dev

dev-full: guard-nonprod ## Complete containerized development environment (one command setup)
	@echo "$(GREEN)🚀 Setting up complete containerized development environment...$(RESET)"
	$(MAKE) bootstrap
	$(MAKE) dev-validate-env
	$(MAKE) dev-up
	$(MAKE) dev-wait-services
	$(MAKE) dev-db-setup
	$(MAKE) dev-health-check
	@echo "$(GREEN)✅ Complete development environment ready!$(RESET)"
	@echo "$(BLUE)🌐 Web App: http://app.lvh.me:5173$(RESET)"
	@echo "$(BLUE)🔌 API: http://api.lvh.me:5000$(RESET)"
	@echo "$(BLUE)🤖 ML Engine: http://localhost:8000$(RESET)"
	@echo "$(BLUE)📊 Bull Board: http://api.lvh.me:5000/admin/queues$(RESET)"

dev-validate-env: ## Validate all environment files exist and are valid
	@echo "$(GREEN)📋 Validating environment files...$(RESET)"
	@if [ ! -f apps/api/.env.local ]; then echo "$(YELLOW)Generating API environment file...$(RESET)"; cd apps/api && pnpm run generate-env; fi
	@if [ ! -f apps/web/.env.local ]; then echo "$(YELLOW)Generating Web environment file...$(RESET)"; cd apps/web && pnpm run generate-env; fi
	@echo "$(GREEN)✅ Environment validation complete$(RESET)"

dev-up: guard-nonprod ## Start all development containers
	@echo "$(GREEN)🐳 Starting all development containers...$(RESET)"
	docker-compose -f docker-compose.dev.yml up -d --build

dev-wait-services: ## Wait for all containerized services to be healthy
	@echo "$(YELLOW)⏳ Waiting for services to be healthy...$(RESET)"
	@timeout 300 sh -c 'until docker-compose -f docker-compose.dev.yml ps --filter "health=healthy" | grep -q "healthy.*healthy.*healthy"; do echo "Waiting for services..."; sleep 5; done' || (echo "$(RED)Services failed to start$(RESET)" && exit 1)
	@echo "$(GREEN)✅ All services are healthy$(RESET)"

dev-db-setup: ## Setup database for containerized environment
	@echo "$(GREEN)🗄️ Setting up database...$(RESET)"
	@sleep 5  # Give DB extra time to be fully ready
	docker-compose -f docker-compose.dev.yml exec api pnpm run migrate:local
	docker-compose -f docker-compose.dev.yml exec api pnpm run demo:apply -- --all
	@echo "$(GREEN)✅ Database setup complete$(RESET)"

dev-health-check: ## Validate all services are responding properly
	@echo "$(GREEN)🔍 Running health checks...$(RESET)"
	@curl -f -s http://api.lvh.me:5000/health > /dev/null && echo "$(GREEN)✅ API health check passed$(RESET)" || (echo "$(RED)❌ API health check failed$(RESET)" && exit 1)
	@curl -f -s http://app.lvh.me:5173/ > /dev/null && echo "$(GREEN)✅ Web health check passed$(RESET)" || (echo "$(RED)❌ Web health check failed$(RESET)" && exit 1)
	@curl -f -s http://localhost:8000/health > /dev/null && echo "$(GREEN)✅ ML Engine health check passed$(RESET)" || echo "$(YELLOW)⚠️ ML Engine health check failed (may not be critical)$(RESET)"
	@echo "$(GREEN)✅ All health checks complete$(RESET)"

dev-logs: ## Show logs from all development services
	docker-compose -f docker-compose.dev.yml logs -f

dev-restart: guard-nonprod ## Restart all development services
	@echo "$(YELLOW)🔄 Restarting all development services...$(RESET)"
	docker-compose -f docker-compose.dev.yml restart
	@echo "$(GREEN)✅ Services restarted$(RESET)"

dev-stop: guard-nonprod ## Stop all development services
	@echo "$(YELLOW)🛑 Stopping all development services...$(RESET)"
	docker-compose -f docker-compose.dev.yml stop
	@echo "$(GREEN)✅ Services stopped$(RESET)"

dev-down: guard-nonprod ## Stop and remove all development containers
	@echo "$(YELLOW)⬇️ Stopping and removing development containers...$(RESET)"
	docker-compose -f docker-compose.dev.yml down
	@echo "$(GREEN)✅ Development containers removed$(RESET)"

dev-clean: guard-nonprod ## Clean restart everything (rebuild containers)
	@echo "$(YELLOW)🧹 Clean restart of development environment...$(RESET)"
	docker-compose -f docker-compose.dev.yml down --volumes --remove-orphans
	docker-compose -f docker-compose.dev.yml up -d --build
	$(MAKE) dev-wait-services
	$(MAKE) dev-db-setup
	@echo "$(GREEN)✅ Clean restart complete$(RESET)"

dev-status: ## Show status of all development services
	@echo "$(BLUE)📊 Development Services Status:$(RESET)"
	docker-compose -f docker-compose.dev.yml ps

##@ Staging
staging-validate-env: ## Validate staging environment files exist and are valid
	@echo "$(GREEN)📋 Validating staging environment files...$(RESET)"
	@if [ ! -f apps/api/.env.staging ]; then echo "$(RED)Missing apps/api/.env.staging$(RESET)"; exit 1; fi
	@if [ ! -f apps/api/.env.staging.secrets ]; then echo "$(RED)Missing apps/api/.env.staging.secrets$(RESET)"; exit 1; fi
	@echo "$(GREEN)✅ Staging environment validation complete$(RESET)"

staging-up: staging-validate-env ## Start all staging containers
	@echo "$(GREEN)🐳 Starting staging environment...$(RESET)"
	$(DOCKER_COMPOSE_STAGING) up -d --build

staging-wait-services: ## Wait for all staging services to be healthy
	@echo "$(YELLOW)⏳ Waiting for staging services to be healthy...$(RESET)"
	@timeout 300 sh -c 'until $(DOCKER_COMPOSE_STAGING) ps --filter "health=healthy" | grep -q "healthy.*healthy.*healthy"; do echo "Waiting for services..."; sleep 5; done' || (echo "$(RED)Staging services failed to start$(RESET)" && exit 1)
	@echo "$(GREEN)✅ All staging services are healthy$(RESET)"

staging-db-setup: ## Setup database for staging environment
	@echo "$(GREEN)🗄️ Setting up staging database...$(RESET)"
	@sleep 5  # Give DB extra time to be fully ready
	$(DOCKER_COMPOSE_STAGING) exec api pnpm run migrate:staging
	$(DOCKER_COMPOSE_STAGING) exec api pnpm run demo:apply -- --all
	@echo "$(GREEN)✅ Staging database setup complete$(RESET)"

staging-health-check: ## Validate all staging services are responding properly
	@echo "$(GREEN)🔍 Running staging health checks...$(RESET)"
	@curl -f -s http://api.lvh.me:5000/health > /dev/null && echo "$(GREEN)✅ API health check passed$(RESET)" || (echo "$(RED)❌ API health check failed$(RESET)" && exit 1)
	@curl -f -s http://app.lvh.me:3000/ > /dev/null && echo "$(GREEN)✅ Web health check passed$(RESET)" || (echo "$(RED)❌ Web health check failed$(RESET)" && exit 1)
	@curl -f -s http://localhost:8000/health > /dev/null && echo "$(GREEN)✅ ML Engine health check passed$(RESET)" || echo "$(YELLOW)⚠️ ML Engine health check failed (may not be critical)$(RESET)"
	@echo "$(GREEN)✅ All staging health checks complete$(RESET)"

staging-full: ## Complete staging environment setup (one command)
	@echo "$(GREEN)🚀 Setting up complete staging environment...$(RESET)"
	$(MAKE) staging-up
	$(MAKE) staging-wait-services
	$(MAKE) staging-db-setup
	$(MAKE) staging-health-check
	@echo "$(GREEN)✅ Complete staging environment ready!$(RESET)"
	@echo "$(BLUE)🌐 Web App: http://app.lvh.me:3000$(RESET)"
	@echo "$(BLUE)🔌 API: http://api.lvh.me:5000$(RESET)"
	@echo "$(BLUE)🤖 ML Engine: http://localhost:8000$(RESET)"
	@echo "$(BLUE)📊 Bull Board: http://api.lvh.me:5000/admin/queues$(RESET)"

staging-logs: ## Show logs from all staging services
	$(DOCKER_COMPOSE_STAGING) logs -f

staging-restart: ## Restart all staging services
	@echo "$(YELLOW)🔄 Restarting all staging services...$(RESET)"
	$(DOCKER_COMPOSE_STAGING) restart
	@echo "$(GREEN)✅ Staging services restarted$(RESET)"

staging-stop: ## Stop all staging services
	@echo "$(YELLOW)🛑 Stopping all staging services...$(RESET)"
	$(DOCKER_COMPOSE_STAGING) stop
	@echo "$(GREEN)✅ Staging services stopped$(RESET)"

staging-down: ## Stop and remove all staging containers
	@echo "$(YELLOW)⬇️ Stopping and removing staging containers...$(RESET)"
	$(DOCKER_COMPOSE_STAGING) down
	@echo "$(GREEN)✅ Staging containers removed$(RESET)"

staging-clean: ## Clean restart staging environment (rebuild containers)
	@echo "$(YELLOW)🧹 Clean restart of staging environment...$(RESET)"
	$(DOCKER_COMPOSE_STAGING) down --volumes --remove-orphans
	$(DOCKER_COMPOSE_STAGING) up -d --build
	$(MAKE) staging-wait-services
	$(MAKE) staging-db-setup
	@echo "$(GREEN)✅ Staging clean restart complete$(RESET)"

staging-status: ## Show status of all staging services
	@echo "$(BLUE)📊 Staging Services Status:$(RESET)"
	$(DOCKER_COMPOSE_STAGING) ps

##@ Database
db-wait: ## Wait for Postgres to become ready
	@echo "$(YELLOW)⏳ Waiting for database to be ready...$(RESET)"
	@timeout $(WAIT_TIMEOUT) sh -c 'until docker exec $(DB_CONTAINER) pg_isready -U $(DB_USER) -d $(DB_NAME); do sleep 1; done' || (echo "$(RED)Database failed to start$(RESET)" && exit 1)

db-migrate: guard-nonprod ## Run database migrations (local)
	@echo "$(GREEN)Running migrations...$(RESET)"
	pnpm --filter @accountable-books/api migrate:local

db-rollback: guard-nonprod ## Rollback last migration (local)
	@echo "$(YELLOW)Rolling back migration...$(RESET)"
	pnpm --filter @accountable-books/api migrate:rollback

db-seed: guard-nonprod ## Seed database with demo data (all steps)
	@echo "$(GREEN)Seeding database (demo:apply --all)...$(RESET)"
	pnpm --filter @accountable-books/api demo:apply -- $(SEED_ARGS)

db-reset: guard-nonprod ## Reset database (drop, migrate, seed)
	@echo "$(YELLOW)Resetting database (drop + migrate + seed)...$(RESET)"
	pnpm --filter @accountable-books/api reset:db

db-prepare: guard-nonprod db-up db-wait db-migrate ## Bring up DB, wait, and migrate
	@echo "$(GREEN)✅ DB prepared (up + ready + migrated)$(RESET)"

db-setup: guard-nonprod db-prepare db-seed ## Full DB setup (up + ready + migrated + seeded)
	@echo "$(GREEN)✅ DB setup complete (includes seeding)$(RESET)"

db-logs: ## Show database logs
	$(DOCKER_COMPOSE_DEV) logs -f db

db-shell: ## Connect to Postgres shell
	@if ! docker ps | grep -q $(DB_CONTAINER); then echo "$(RED)Database container not running. Run 'make db-up' first.$(RESET)"; exit 1; fi
	docker exec -it $(DB_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME)


# --- Test DB helpers ---
TEST_DB_NAME := test_db

db-test-create: guard-nonprod ## Create test database if missing
	@if ! docker ps | grep -q $(DB_CONTAINER); then echo "$(RED)DB not running. Run 'make db-up' first.$(RESET)"; exit 1; fi
	@echo "$(GREEN)Ensuring test database exists ($(TEST_DB_NAME))...$(RESET)"
	@docker exec -i $(DB_CONTAINER) bash -lc "psql -U $(DB_USER) -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='$(TEST_DB_NAME)'\" | grep -q 1 || psql -U $(DB_USER) -d postgres -c \"CREATE DATABASE $(TEST_DB_NAME)\""
	@echo "$(GREEN)✅ Test database ready$(RESET)"

db-test-migrate: guard-nonprod ## Run migrations against test database
	@echo "$(GREEN)Running test migrations...$(RESET)"
	PNPM_FILTER=@accountable-books/api NODE_ENV=test pnpm --filter @accountable-books/api migrate:test
	@echo "$(GREEN)✅ Test migrations complete$(RESET)"

db-test-prepare: guard-nonprod db-up db-wait db-test-create db-test-migrate ## Prepare Postgres test DB
	@echo "$(GREEN)✅ Test DB prepared (up + ready + migrated)$(RESET)"

##@ Demo Seeds (DEX)
demo-apply: guard-nonprod ## Apply demo seeds (use ARGS="--all" or e.g. "--country US --type business")
	pnpm --filter @accountable-books/api demo:apply -- $(ARGS)

demo-reverse: guard-nonprod ## Delete demo data (use ARGS="--all" or "--company bizDemoUS")
	pnpm --filter @accountable-books/api demo:reverse -- $(ARGS)

demo-reset: guard-nonprod ## Delete then recreate demo data (use ARGS="--country US")
	pnpm --filter @accountable-books/api demo:reset -- $(ARGS)

demo-status: ## Show current demo data counts
	pnpm --filter @accountable-books/api demo:status

##@ API
api-dev: db-prepare ## Start API in development mode (prepares DB; no seeding)
	@echo "$(GREEN)Starting API (no seeding)$(RESET)"
	pnpm --filter @accountable-books/api dev

api-build: ## Build API
	pnpm --filter @accountable-books/api build

api-test: ## Run API tests
	pnpm --filter @accountable-books/api test

##@ Web App
web-dev: ## Start web app in development mode
	pnpm --filter @accountable-books/web dev

web-build: ## Build web app
	pnpm --filter @accountable-books/web build

web-test: ## Run web app tests
	pnpm --filter @accountable-books/web test

##@ Contracts & Types
validate-contracts: ## Validate OpenAPI contracts with Spectral
	@echo "$(GREEN)Validating OpenAPI contracts...$(RESET)"
	pnpm validate-contracts

bundle-contracts: ## Bundle OpenAPI contracts with Redocly (dereferenced)
	@echo "$(GREEN)Bundling OpenAPI contracts...$(RESET)"
	pnpm bundle-contracts

bundle-contracts-watch: ## Bundle OpenAPI contracts in watch mode
	@echo "$(GREEN)Watching and bundling OpenAPI contracts...$(RESET)"
	pnpm exec redocly bundle packages/contracts/openapi.yaml --output packages/contracts/dist/openapi-bundled.yaml --dereferenced --watch

contracts-watch: ## Watch contracts; validate + bundle + regenerate types on change
	@echo "$(GREEN)Starting contracts watcher (validate + bundle + codegen)...$(RESET)"
	pnpm contracts:watch

clean-bundled: ## Clean bundled contract files
	@echo "$(YELLOW)Cleaning bundled contracts...$(RESET)"
	rm -rf packages/contracts/dist

codegen: ## Generate TypeScript types from OpenAPI
	@echo "$(GREEN)Generating types from OpenAPI contracts...$(RESET)"
	pnpm codegen

contracts: validate-contracts bundle-contracts codegen ## Full contract workflow (validate + bundle + generate)
	@echo "$(GREEN)✅ Contracts validated, bundled, and types generated$(RESET)"

##@ Build & Test
build: ## Build all packages
	@echo "$(GREEN)Building all packages...$(RESET)"
	pnpm build

test: ## Run all tests
	@echo "$(GREEN)Running tests...$(RESET)"
	pnpm test

check: contracts ## Run all quality checks (lint, typecheck, format)
	@echo "$(GREEN)Running quality checks...$(RESET)"
	pnpm lint
	pnpm typecheck
	pnpm format:check

ci: check test ## CI: quality checks + tests
	@echo "$(GREEN)✅ CI checks and tests completed$(RESET)"

##@ Maintenance
clean: guard-nonprod ## Clean generated files and containers
	@echo "$(YELLOW)Cleaning workspace...$(RESET)"
	$(MAKE) db-down
	$(MAKE) clean-bundled
	docker system prune -f || true
	pnpm clean || true
	@echo "$(GREEN)✅ Workspace cleaned$(RESET)"

clean-all: guard-nonprod ## Nuclear cleanup: remove caches, node_modules, and reinstall
	@echo "$(RED)Nuclear cleanup starting...$(RESET)"
	@echo "$(YELLOW)Stopping Docker services...$(RESET)"
	$(MAKE) db-down || true
	@echo "$(YELLOW)Removing all node_modules...$(RESET)"
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	@echo "$(YELLOW)Removing all coverage and cache directories...$(RESET)"
	rm -rf apps/*/coverage packages/*/coverage coverage
	rm -rf .turbo apps/*/.turbo packages/*/.turbo
	rm -rf apps/*/dist packages/*/dist dist
	@echo "$(YELLOW)Cleaning pnpm store cache...$(RESET)"
	pnpm store prune || true
	@echo "$(YELLOW)Cleaning bundled contracts...$(RESET)"
	$(MAKE) clean-bundled
	@echo "$(YELLOW)Cleaning Docker...$(RESET)"
	docker system prune -f || true
	@echo "$(GREEN)Installing dependencies...$(RESET)"
	pnpm install
	@echo "$(GREEN)Regenerating contracts and types...$(RESET)"
	$(MAKE) contracts
	@echo "$(GREEN)✅ Nuclear cleanup complete!$(RESET)"

reset: guard-nonprod clean bootstrap ## Full reset: clean everything and bootstrap fresh
	@echo "$(GREEN)✅ Full reset complete$(RESET)"
