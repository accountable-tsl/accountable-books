.PHONY: help bootstrap dev dev-setup ci check build test clean clean-all reset
.PHONY: db-up db-down db-restart db-wait db-prepare db-setup db-migrate db-rollback db-seed db-reset db-logs db-shell
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
DOCKER_COMPOSE := docker-compose -f docker-compose.dev.yml
DB_CONTAINER := accountable-books-db
DB_NAME := accountable_books
DB_USER := user
APP_ENV ?= local
WAIT_TIMEOUT ?= 30
SEED_ARGS ?= --all

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

##@ Database
db-up: guard-nonprod ## Start database services (Postgres + Redis)
	@echo "$(GREEN)Starting database services...$(RESET)"
	@if [ ! -f docker-compose.dev.yml ]; then echo "$(RED)docker-compose.dev.yml not found$(RESET)"; exit 1; fi
	$(DOCKER_COMPOSE) up -d db redis

db-down: guard-nonprod ## Stop database services
	@echo "$(YELLOW)Stopping database services...$(RESET)"
	$(DOCKER_COMPOSE) down

db-restart: guard-nonprod db-down db-up ## Restart database services

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
	$(DOCKER_COMPOSE) logs -f db

db-shell: ## Connect to Postgres shell
	@if ! docker ps | grep -q $(DB_CONTAINER); then echo "$(RED)Database container not running. Run 'make db-up' first.$(RESET)"; exit 1; fi
	docker exec -it $(DB_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME)

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
