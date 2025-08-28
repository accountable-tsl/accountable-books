.PHONY: help bootstrap dev dev-setup ci check build test clean clean-all reset
# .PHONY: db-up db-down db-restart db-wait db-prepare db-setup db-migrate db-rollback db-seed db-reset db-logs db-shell
# .PHONY: db-test-create db-test-migrate db-test-prepare
.PHONY: api-dev api-build api-test web-dev web-build web-test
.PHONY: validate-contracts bundle-contracts bundle-contracts-watch contracts-watch clean-bundled codegen contracts
.PHONY: demo-apply demo-reverse demo-reset demo-status

## Structure [domain]-[environment]-[action]
# Colors for output
GREEN := \033[32m
YELLOW := \033[33m
BLUE := \033[34m
RED := \033[31m
RESET := \033[0m


# Config
DOCKER_COMPOSE_DEV := docker-compose -f docker-compose.dev.yml
DOCKER_COMPOSE_STAGING := docker-compose -f docker-compose.staging.yml
PID_FILE := .dev_server.pid


APP_ENV ?= local
WAIT_TIMEOUT ?= 30
ARGS ?= --all

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

# Development
dev-setup: guard-nonprod ## Setup development environment
	@echo "$(GREEN)Setting up...$(RESET)"
	@echo "$(YELLOW)🐳 Starting infrastructure (DB + Redis)...$(RESET)"
	$(MAKE) db-dev-up
	@echo "$(YELLOW)🗄️ Running migrations...$(RESET)"
	$(MAKE) db-dev-migrate
	@echo "$(YELLOW)📦 Installing dependencies...$(RESET)"
	pnpm install
	@echo "$(GREEN)✅ Setup complete$(RESET)"
	@echo "$(BLUE)Run 'make demo-apply' to apply demo seeds$(RESET)"
	@echo "$(BLUE)💡 Ready to develop! Run 'make dev or pnpm dev' to start all apps$(RESET)"

dev: guard-nonprod ## Start apps in development mode (Turbo orchestration)
	@echo "$(GREEN)Starting apps via Turbo...$(RESET)"
	pnpm dev

dev-full: guard-nonprod ## Complete development environment setup (3-command approach)
	@echo "$(GREEN)🚀 Setting up complete development environment...$(RESET)"
	$(MAKE) dev-setup
	$(MAKE) demo-apply
	$(MAKE) dev

dev-down: ## Stop development environment
	@echo "$(YELLOW)Stopping development environment...$(RESET)"
	$(MAKE) db-dev-down
	@-if [ -f $(PID_FILE) ]; then kill $(shell cat $(PID_FILE)); fi
	@echo "$(GREEN) Development environment stopped $(RESET)"

dev-api: ## Start API development server
	pnpm -F @accountable-books/api run dev
dev-web: ## Start Web development server
	pnpm -F @accountable-books/web run dev
dev-ml: ## Start ML Engine development server
	pnpm -F @accountable-books/ml-engine dev



##@ Demo Seeds (DEX)
demo-apply: ## Apply demo seeds (use ARGS="--all" or e.g. "--country US --type business")
	pnpm --filter @accountable-books/api demo:apply -- $(SEED_ARGS)

demo-reverse: ## Delete demo data (use ARGS="--all" or "--company bizDemoUS")
	pnpm --filter @accountable-books/api demo:reverse -- $(SEED_ARGS)

demo-reset: ## Delete then recreate demo data (use ARGS="--country US")
	pnpm --filter @accountable-books/api demo:reset -- $(SEED_ARGS)

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

##@ Deployment 
deploy-local-staging: ## Deploy to staging (local)
	@echo "$(GREEN)Deploying to staging (local)$(RESET)"
	$(MAKE) db-staging-up-postgres ## Start postgres service
	$(MAKE) db-local-staging-migrate ## Run migrations
	$(MAKE) db-local-staging-apply-demo ## Seed database
	$(MAKE) db-staging-up-redis ## Start redis service


drop-local-staging: ## Stop staging services
	@echo "$(YELLOW)Stopping staging services...$(RESET)"
	$(MAKE) db-staging-nuke

deploy-remote-staging: ## Deploy to staging (remote)
	@echo "$(GREEN)Deploying to staging (remote)$(RESET)"
	$(MAKE) db-remote-staging-migrate
	$(MAKE) db-remote-staging-migrate
	$(MAKE) db-remote-staging-apply-demo
	./scripts/deploy-fly-staging.sh deploy ## for fly.io
	## not sure what i did for vercel
	## is it possible to make sure all these happens whenever i push to staging branch?


