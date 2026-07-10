# Accountable Books - Developer Experience Makefile
# Simplicity over everything. Keep it minimal, keep it clear.

.PHONY: help setup dev demo clean check fix build deploy

# Colors for output
GREEN := \033[32m
YELLOW := \033[33m
BLUE := \033[34m
RED := \033[31m
RESET := \033[0m

# Include infrastructure makefiles
MAKEFILES_DIR := infra/makefiles
ifneq ($(wildcard $(MAKEFILES_DIR)/*.mk),)
    include $(wildcard $(MAKEFILES_DIR)/*.mk)
endif

# Guard: prevent destructive commands in production contexts
.PHONY: guard-nonprod
guard-nonprod:
	@if [ "$(APP_ENV)" = "production" ] || [ "$(NODE_ENV)" = "production" ] || [ -n "$$FLY_APP_NAME" ] || [ -n "$$VERCEL" ]; then \
		echo "$(RED)❌ Refusing to run this target in a production-like context.$(RESET)"; \
		echo "$(YELLOW)💡 Hint: set APP_ENV=local (or unset NODE_ENV) to proceed locally.$(RESET)"; \
		exit 1; \
	fi

check-prereqs: ## Check for required tools
	@./scripts/check-prerequisites.sh

##@ 🚀 Quick Start (Most Common)
setup: guard-nonprod check-prereqs ## One-command setup: infra + deps + env + db + demo
	@echo "$(GREEN)🚀 Setting up Accountable Books development environment...$(RESET)"
	@echo "$(YELLOW)🐳 Starting infrastructure (DB + Redis)...$(RESET)"
	@$(MAKE) db-up
	@echo "$(YELLOW)📦 Installing Node.js dependencies...$(RESET)"
	@pnpm install
	@echo "$(YELLOW)🔨 Building @accountable-books/utils...$(RESET)"
	@pnpm -F @accountable-books/utils run build
	@echo "$(YELLOW)🔧 Generating environment files...$(RESET)"
	@pnpm run generate-env
	@echo "$(YELLOW)🗄️ Running database migrations...$(RESET)"
	@$(MAKE) db-migrate
	@echo "$(YELLOW)🔨 Building @accountable-books/contracts (data + pydantic)...$(RESET)"
	@pnpm -F @accountable-books/contracts run build
	@echo "$(YELLOW)🐍 Installing Python dependencies (ML Engine)...$(RESET)"
	@cd apps/ml-engine && uv sync --frozen
	@echo "$(YELLOW)🌱 Applying demo data...$(RESET)"
	@$(MAKE) db-seed
	@echo "$(GREEN)✅ Setup complete!$(RESET)"
	@echo "$(BLUE)💡 Run 'make dev' to start developing$(RESET)"

install: guard-nonprod ## Install dependencies and generate env files
	@echo "$(GREEN)📦 Installing Node.js dependencies...$(RESET)"
	@pnpm install
	@echo "$(YELLOW)🔨 Building @accountable-books/utils...$(RESET)"
	@pnpm -F @accountable-books/utils run build
	@echo "$(YELLOW)🔧 Generating environment files...$(RESET)"
	@pnpm run generate-env
	@cd apps/ml-engine && uv sync --frozen

dev: guard-nonprod ## Start core apps (api, web, ml-engine; excludes web-payroll)
	@echo "$(GREEN)🎯 Starting development environment...$(RESET)"
	@echo "$(YELLOW)🔨 Ensuring dependencies are built...$(RESET)"
	@pnpm -F @accountable-books/utils run build
	@pnpm -F @accountable-books/contracts run build
	@pnpm dev:core

##@ 🚀 Combined Workflows
dev-full: guard-nonprod ## Start development with infrastructure (db + redis + turbo)
	@echo "$(GREEN)🚀 Starting full development environment...$(RESET)"
	@echo "$(YELLOW)🐳 Starting infrastructure...$(RESET)"
	@$(MAKE) db-up
	@echo "$(YELLOW)🔨 Ensuring dependencies are built...$(RESET)"
	@pnpm -F @accountable-books/utils run build
	@pnpm -F @accountable-books/contracts run build
	@echo "$(YELLOW)⚡ Starting apps via Turbo...$(RESET)"
	@pnpm dev

staging-local: guard-nonprod ## Start local staging containers, then migrate and seed
	@$(MAKE) staging-full-up

##@ 🌱 Demo Data
demo: ## Apply demo data
	@echo "$(GREEN)🌱 Applying demo data...$(RESET)"
	@pnpm -F @accountable-books/api run demo -- apply

demo-status: ## Show demo data status
	@pnpm -F @accountable-books/api run demo -- status

demo-basic: ## Apply demo data without bank transactions
	@echo "$(GREEN)🌱 Applying demo data (without transactions)...$(RESET)"
	@pnpm -F @accountable-books/api run demo -- apply --exclude bank-transactions

demo-reverse: guard-nonprod ## Remove demo data
	@echo "$(YELLOW)🗑️ Removing demo data...$(RESET)"
	@pnpm -F @accountable-books/api run demo -- reverse

##@ 🔧 Quality & Build
check: ## Run read-only quality checks (lint + typecheck + format check)
	@echo "$(GREEN)🔍 Running quality checks...$(RESET)"
	@pnpm lint
	@pnpm typecheck
	@pnpm format:check

fix: ## Format code and apply safe lint fixes
	@echo "$(GREEN)🎨 Formatting and fixing code...$(RESET)"
	@pnpm run fix

build: ## Build all packages
	@echo "$(GREEN)🔨 Building all packages...$(RESET)"
	@pnpm build

contracts-build: ## Build contracts package explicitly
	@echo "$(GREEN)🔨 Building contracts package...$(RESET)"
	@pnpm -F @accountable-books/contracts run build

test: ## Run all tests
	@echo "$(GREEN)🧪 Running tests...$(RESET)"
	@pnpm test

##@ 🎨 Code Quality
lint: ## Run linting across all packages
	@echo "$(GREEN)🔍 Running linting...$(RESET)"
	@pnpm lint

format: ## Format code across all packages
	@echo "$(GREEN)🎨 Formatting code...$(RESET)"
	@pnpm format

format-check: ## Check code formatting
	@echo "$(GREEN)🔍 Checking code formatting...$(RESET)"
	@pnpm format:check

typecheck: ## Run type checking across all packages
	@echo "$(GREEN)🔍 Running type checking...$(RESET)"
	@pnpm typecheck

##@ 🧹 Cleanup
clean: guard-nonprod ## Clean workspace: stop infra, clean caches
	@echo "$(YELLOW)🧹 Cleaning workspace...$(RESET)"
	@$(MAKE) db-down || true
	@pnpm clean || true
	@docker system prune -f || true
	@echo "$(GREEN)✅ Workspace cleaned$(RESET)"

clean-all: guard-nonprod ## Nuclear cleanup: deps, build/caches, Python venvs; frozen reinstall (not lockfiles/.env)
	@bash ./scripts/clean-all.sh

##@ 🚢 Deployment & Quality
deploy-check: ## Run all deployment checks (tests + lint + build)
	@echo "$(GREEN)🔍 Running deployment checks...$(RESET)"
	@echo "$(YELLOW)Running tests...$(RESET)"
	@pnpm test
	@echo "$(YELLOW)Checking linting...$(RESET)"
	@pnpm lint
	@echo "$(YELLOW)Building packages...$(RESET)"
	@pnpm build
	@echo "$(GREEN)✅ All checks passed$(RESET)"

deploy-staging: deploy-check ## Deploy to staging (triggered by GitHub workflow)
	@echo "$(GREEN)🚀 Deploying to staging...$(RESET)"
	@echo "$(YELLOW)🔨 Building and pushing API...$(RESET)"
	@./scripts/deploy-fly-staging.sh deploy

##@ ❓ Help
help: ## Show this help
	@echo "$(BLUE)🚀 Accountable Books - Developer Commands$(RESET)"
	@echo ""
	@echo "$(YELLOW)🚀 Daily workflow:$(RESET)"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make setup" "First-time setup: infra + deps + env + db + demo data"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make install" "Install deps and generate env files only"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make dev" "Start core apps: api, web, ml-engine"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make dev-full" "Start infra and all Turbo apps, including web-payroll"
	@echo ""
	@echo "$(YELLOW)🗄️ Database:$(RESET)"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make db-up" "Start local PostgreSQL and Redis"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make db-down" "Stop local PostgreSQL and Redis"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make db-migrate" "Run local migrations and bootstrap catalog"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make db-seed" "Apply local demo data"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make db-reset" "Reset local DB, then migrate and seed"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make db-shell" "Open local PostgreSQL shell"
	@echo ""
	@echo "$(YELLOW)🌱 Demo Data:$(RESET)"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make demo" "Apply local demo data"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make demo-basic" "Apply local demo data without bank transactions"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make demo-status" "Show local demo data status"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make demo-reverse" "Remove local demo data"
	@echo ""
	@echo "$(YELLOW)🔧 Quality & Build:$(RESET)"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make check" "Read-only checks: lint + typecheck + format check"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make fix" "Format code and apply safe lint fixes"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make test" "Run all tests"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make build" "Build all packages"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make contracts-build" "Build shared contracts explicitly"
	@echo ""
	@echo "$(YELLOW)🚀 Services & Staging:$(RESET)"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make api-dev" "Start API only"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make web-dev" "Start web app only"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make ml-only" "Start ML engine only"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make staging-up" "Start local staging containers"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make staging-down" "Stop local staging containers"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make staging-health" "Check local staging health"
	@echo ""
	@echo "$(YELLOW)🧹 Cleanup & Deployment:$(RESET)"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make clean" "Stop infra and clean build caches"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make clean-all" "Nuclear local cleanup; keeps lockfiles and .env files"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make deploy-check" "Run tests, lint, and build before deployment"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "make deploy-staging" "Deploy API to Fly staging"
	@echo ""
	@echo "$(BLUE)💡 Quick Start:$(RESET)"
	@echo "  make setup    # First time setup"
	@echo "  make dev      # Start developing"
	@echo "  make help     # Show this help"
	@echo ""
	@echo "$(BLUE)🔧 Advanced Commands:$(RESET)"
	@echo "  Run 'make help-advanced' for container operations and debugging"

help-advanced: ## Show advanced commands for debugging and container operations
	@echo "$(BLUE)🔧 Advanced Commands - Container Operations & Debugging$(RESET)"
	@echo ""
	@echo "$(YELLOW)🐚 Container Shells:$(RESET)"
	@echo "  make db-shell       # PostgreSQL shell"
	@echo "  make api-shell      # API container shell"
	@echo "  make web-shell      # Web container shell"
	@echo "  make ml-shell       # ML Engine container shell"
	@echo ""
	@echo "$(YELLOW)📋 Container Logs:$(RESET)"
	@echo "  make db-logs        # Database logs"
	@echo "  make api-logs       # API logs"
	@echo "  make web-logs       # Web logs"
	@echo "  make ml-logs        # ML logs"
	@echo ""
	@echo "$(YELLOW)🗄️ Advanced Database:$(RESET)"
	@echo "  make db-reset       # Reset local DB, then migrate and seed"
	@echo "  make db-rollback    # Rollback last local migration"
	@echo "  make db-wait        # Wait for local DB ready"
	@echo ""
	@echo "$(YELLOW)🚀 Staging Environment:$(RESET)"
	@echo "  make staging-up        # Start all staging services"
	@echo "  make staging-down      # Stop all staging services"
	@echo "  make staging-full-up   # Start staging + migrate + seed"
	@echo "  make staging-health    # Check staging health"
	@echo ""
	@echo "$(YELLOW)🔧 Service-Specific Dev:$(RESET)"
	@echo "  make api-dev        # API only (not via Turbo)"
	@echo "  make web-dev        # Web only (not via Turbo)"
	@echo "  make ml-only        # ML only (not via Turbo)"
	@echo ""
	@echo "$(YELLOW)🧪 Local Testing:$(RESET)"
	@echo "  make api-test       # API tests"
	@echo "  make web-test       # Web tests"
	@echo "  make ml-test-local  # ML tests locally"
	@echo ""
	@echo "$(BLUE)💡 Tip: Use these when you need container access or advanced debugging$(RESET)"
