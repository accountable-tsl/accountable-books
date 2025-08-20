.PHONY: help setup dev build test clean check
.PHONY: db-up db-down db-restart db-migrate db-rollback db-seed db-logs db-shell
.PHONY: api-dev api-build api-test web-dev web-build web-test docker-up docker-down docker-build docker-clean
.PHONY: validate-contracts bundle-contracts bundle-contracts-watch clean-bundled codegen contracts

# Colors for output
GREEN := \033[32m
YELLOW := \033[33m
BLUE := \033[34m
RED := \033[31m
RESET := \033[0m

##@ Development
help: ## Display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\n$(BLUE)Usage:$(RESET)\n  make $(YELLOW)<target>$(RESET)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(YELLOW)%-15s$(RESET) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BLUE)%s$(RESET)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

setup: ## Setup complete development environment
	@echo "$(GREEN)Setting up development environment...$(RESET)"
	@echo "$(YELLOW)📦 Installing dependencies...$(RESET)"
	pnpm install
	@echo "$(YELLOW)🔧 Building shared packages...$(RESET)"
	pnpm --filter @accountable-books/utils build
	@echo "$(YELLOW)📋 Generating environment files...$(RESET)"
	pnpm --filter @accountable-books/api generate-env
	pnpm --filter @accountable-books/web generate-env
	@echo "$(YELLOW)🐳 Starting database services...$(RESET)"
	$(MAKE) db-up
	@echo "$(YELLOW)⏳ Waiting for database to be ready...$(RESET)"
	@sleep 5
	@echo "$(YELLOW)🗄️ Running database migrations...$(RESET)"
	$(MAKE) db-migrate
	@echo ""
	@echo "$(GREEN)✅ Setup complete!$(RESET)"
	@echo "$(GREEN)🚀 Run 'make dev' to start developing$(RESET)"
	@echo "$(BLUE)📚 Check the README for more information$(RESET)"

dev: db-up contracts ## Start development environment
	@echo "$(GREEN)Starting development environment...$(RESET)"
	pnpm dev

##@ Database
db-up: ## Start database services
	@echo "$(GREEN)Starting database...$(RESET)"
	docker-compose -f docker-compose.dev.yml up -d db redis

db-down: ## Stop database services
	@echo "$(YELLOW)Stopping database...$(RESET)"
	docker-compose -f docker-compose.dev.yml down

db-restart: db-down db-up ## Restart database services

db-migrate: ## Run database migrations
	@echo "$(GREEN)Running migrations...$(RESET)"
	pnpm --filter @accountable-books/api migrate:local

db-rollback: ## Rollback last migration
	@echo "$(YELLOW)Rolling back migration...$(RESET)"
	pnpm --filter @accountable-books/api migrate:rollback

db-seed: ## Seed database with test data
	@echo "$(GREEN)Seeding database...$(RESET)"
	pnpm --filter @accountable-books/api seed:demo

db-logs: ## Show database logs
	docker-compose -f docker-compose.dev.yml logs -f db

db-shell: ## Connect to database shell
	docker exec -it accountable-books-db psql -U user -d accountable_books

##@ API
api-dev: ## Start API in development mode
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

##@ Docker
docker-up: ## Start all services with Docker
	@echo "$(GREEN)Starting all Docker services...$(RESET)"
	docker-compose -f docker-compose.dev.yml up

docker-down: ## Stop all Docker services
	@echo "$(YELLOW)Stopping all Docker services...$(RESET)"
	docker-compose -f docker-compose.dev.yml down

docker-build: ## Build Docker images
	@echo "$(GREEN)Building Docker images...$(RESET)"
	docker-compose -f docker-compose.dev.yml build

docker-clean: ## Clean Docker (remove volumes, images, rebuild)
	@echo "$(YELLOW)Cleaning Docker environment...$(RESET)"
	docker-compose -f docker-compose.dev.yml down -v --rmi all
	docker-compose -f docker-compose.dev.yml build --no-cache
	@echo "$(GREEN)✅ Docker environment cleaned$(RESET)"

##@ Maintenance
clean: ## Clean all generated files and containers
	@echo "$(YELLOW)Cleaning workspace...$(RESET)"
	$(MAKE) docker-down
	$(MAKE) clean-bundled
	docker system prune -f
	pnpm clean || true
	@echo "$(GREEN)✅ Workspace cleaned$(RESET)"

clean-all: ## Nuclear cleanup: remove all caches, coverage, node_modules, and reinstall
	@echo "$(RED)Nuclear cleanup starting...$(RESET)"
	@echo "$(YELLOW)Stopping Docker services...$(RESET)"
	$(MAKE) docker-down || true
	@echo "$(YELLOW)Removing all node_modules...$(RESET)"
	rm -rf node_modules
	rm -rf apps/*/node_modules
	rm -rf packages/*/node_modules
	@echo "$(YELLOW)Removing all coverage reports...$(RESET)"
	rm -rf apps/*/coverage
	rm -rf packages/*/coverage
	rm -rf coverage
	@echo "$(YELLOW)Removing all cache directories...$(RESET)"
	rm -rf .turbo
	rm -rf apps/*/.turbo
	rm -rf packages/*/.turbo
	rm -rf apps/*/dist
	rm -rf packages/*/dist
	rm -rf dist
	@echo "$(YELLOW)Removing pnpm store cache...$(RESET)"
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

reset: clean setup ## Full reset: clean everything and setup fresh
	@echo "$(GREEN)✅ Full reset complete$(RESET)"