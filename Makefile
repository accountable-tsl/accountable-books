# Accountable Books - Developer Experience Makefile
# Simplicity over everything. Keep it minimal, keep it clear.

.PHONY: help setup dev demo clean check build deploy

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

##@ 🚀 Quick Start (Most Common)
setup: guard-nonprod ## One-command setup: infra + deps + db + demo
	@echo "$(GREEN)🚀 Setting up Accountable Books development environment...$(RESET)"
	@echo "$(YELLOW)🐳 Starting infrastructure (DB + Redis)...$(RESET)"
	@$(MAKE) db-up
	@echo "$(YELLOW)🗄️ Running database migrations...$(RESET)"
	@$(MAKE) db-migrate
	@echo "$(YELLOW)📦 Installing dependencies...$(RESET)"
	@pnpm install
	@echo "$(YELLOW)🌱 Applying demo data...$(RESET)"
	@$(MAKE) db-seed
	@echo "$(GREEN)✅ Setup complete!$(RESET)"
	@echo "$(BLUE)💡 Run 'make dev' to start developing$(RESET)"

dev: guard-nonprod ## Start all apps in development mode (Turbo)
	@echo "$(GREEN)🎯 Starting development environment...$(RESET)"
	@echo "$(YELLOW)🔨 Ensuring dependencies are built...$(RESET)"
	@pnpm -F @accountable-books/utils run build
	@pnpm dev

##@ 🚀 Combined Workflows
dev-full: guard-nonprod ## Start development with infrastructure (db + redis + turbo)
	@echo "$(GREEN)🚀 Starting full development environment...$(RESET)"
	@echo "$(YELLOW)🐳 Starting infrastructure...$(RESET)"
	@$(MAKE) db-up
	@echo "$(YELLOW)🔨 Ensuring dependencies are built...$(RESET)"
	@pnpm -F @accountable-books/utils run build
	@echo "$(YELLOW)⚡ Starting apps via Turbo...$(RESET)"
	@pnpm dev

staging-local: guard-nonprod ## Start local staging environment (infra + apps)
	@echo "$(GREEN)🚀 Starting local staging environment...$(RESET)"
	@echo "$(YELLOW)🐳 Starting staging infrastructure...$(RESET)"
	@$(MAKE) staging-up
	@echo "$(YELLOW)⚡ Starting apps...$(RESET)"
	@pnpm dev:staging 2>/dev/null || echo "Note: Individual apps may need staging config"

##@ 🌱 Demo Data
demo: ## Apply demo data
	@echo "$(GREEN)🌱 Applying demo data...$(RESET)"
	@pnpm -F @accountable-books/api run demo:apply

demo-status: ## Show demo data status
	@pnpm -F @accountable-books/api run demo:status

demo-reverse: guard-nonprod ## Remove demo data
	@echo "$(YELLOW)🗑️ Removing demo data...$(RESET)"
	@pnpm -F @accountable-books/api run demo:reverse

##@ 🔧 Quality & Build
check: ## Run all quality checks (lint + typecheck + format)
	@echo "$(GREEN)🔍 Running quality checks...$(RESET)"
	@pnpm format
	@pnpm lint
	@pnpm typecheck
	@pnpm format:check

build: ## Build all packages
	@echo "$(GREEN)🔨 Building all packages...$(RESET)"
	@pnpm build

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

clean-all: guard-nonprod ## Nuclear cleanup: remove everything and reinstall
	@echo "$(RED)💥 Nuclear cleanup starting...$(RESET)"
	@echo "$(YELLOW)🛑 Stopping infrastructure...$(RESET)"
	@$(MAKE) db-down || true
	@echo "$(YELLOW)🗑️ Removing node_modules and caches...$(RESET)"
	@rm -rf node_modules pnpm-lock.yaml apps/*/node_modules packages/*/node_modules
	@rm -rf apps/*/dist packages/*/dist dist .pnpm-store .vscode
	@rm -rf apps/*/coverage packages/*/coverage coverage
	@rm -rf .turbo apps/*/.turbo packages/*/.turbo
	@echo "$(YELLOW)📦 Cleaning pnpm cache...$(RESET)"
	@pnpm store prune || true
	@echo "$(YELLOW)🐳 Cleaning Docker...$(RESET)"
	@docker system prune -f || true
	@echo "$(GREEN)📦 Reinstalling dependencies...$(RESET)"
	@pnpm install
	@echo "$(GREEN)🔨 Running quality checks...$(RESET)"
	@$(MAKE) check
	@echo "$(GREEN)✅ Nuclear cleanup complete!$(RESET)"

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
	@./scripts/deploy-staging.sh

##@ ❓ Help
help: ## Show this help
	@echo "$(BLUE)🚀 Accountable Books - Developer Commands$(RESET)"
	@echo ""
	@echo "$(YELLOW)🚀 Quick Start (Most Common):$(RESET)"
	@awk 'BEGIN {FS = ":.*##"} /^##@ 🚀 Quick Start/ {found=1; next} found && /^##@/ {exit} found && /^[a-zA-Z_-]+:.*?##/ {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(YELLOW)🗄️ Database:$(RESET)"
	@awk 'BEGIN {FS = ":.*##"} /^db-/ {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}' infra/makefiles/db.mk | sort | uniq
	@echo ""
	@echo "$(YELLOW)🌱 Demo Data:$(RESET)"
	@awk 'BEGIN {FS = ":.*##"} /^##@ 🌱 Demo Data/ {found=1; next} found && /^##@/ {exit} found && /^[a-zA-Z_-]+:.*?##/ {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(YELLOW)🔧 Quality & Build:$(RESET)"
	@awk 'BEGIN {FS = ":.*##"} /^##@ 🔧 Quality & Build/ {found=1; next} found && /^##@/ {exit} found && /^[a-zA-Z_-]+:.*?##/ {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(YELLOW)🧹 Cleanup:$(RESET)"
	@awk 'BEGIN {FS = ":.*##"} /^##@ 🧹 Cleanup/ {found=1; next} found && /^##@/ {exit} found && /^[a-zA-Z_-]+:.*?##/ {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(YELLOW)🚢 Deployment:$(RESET)"
	@awk 'BEGIN {FS = ":.*##"} /^##@ 🚢 Deployment/ {found=1; next} found && /^##@/ {exit} found && /^[a-zA-Z_-]+:.*?##/ {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
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
	@echo "  make db-reset       # Reset DB (rollback all + migrate)"
	@echo "  make db-rollback    # Rollback last migration"
	@echo "  make db-wait        # Wait for DB ready"
	@echo ""
	@echo "$(YELLOW)🚀 Staging Environment:$(RESET)"
	@echo "  make staging-up     # Start all staging services"
	@echo "  make staging-down   # Stop all staging services"
	@echo "  make staging-full-up   # Start staging + migrate + seed"
	@echo "  make staging-health    # Check staging health"
	@echo ""
	@echo "$(YELLOW)🔧 Service-Specific Dev:$(RESET)"
	@echo "  make api-only       # API only (not via Turbo)"
	@echo "  make web-only       # Web only (not via Turbo)"
	@echo "  make ml-only        # ML only (not via Turbo)"
	@echo ""
	@echo "$(YELLOW)🧪 Local Testing:$(RESET)"
	@echo "  make api-test-local    # API tests locally"
	@echo "  make web-test          # Web tests"
	@echo "  make ml-test-local     # ML tests locally"
	@echo ""
	@echo "$(BLUE)💡 Tip: Use these when you need container access or advanced debugging$(RESET)"




