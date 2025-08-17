.PHONY: help setup dev build test clean check
.PHONY: db-up db-down db-restart db-migrate db-rollback db-seed db-logs db-shell
.PHONY: api-dev api-build api-test docker-up docker-down docker-build docker-clean

# Colors for output
GREEN := \033[32m
YELLOW := \033[33m
BLUE := \033[34m
RESET := \033[0m

##@ Development
help: ## Display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\n$(BLUE)Usage:$(RESET)\n  make $(YELLOW)<target>$(RESET)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(YELLOW)%-15s$(RESET) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BLUE)%s$(RESET)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

setup: ## Setup complete development environment
	@echo "$(GREEN)Setting up development environment...$(RESET)"
	pnpm install
	$(MAKE) db-up
	@echo "$(YELLOW)Waiting for database to be ready...$(RESET)"
	@sleep 5
	$(MAKE) db-migrate
	@echo "$(GREEN)✅ Setup complete! Run 'make dev' to start developing$(RESET)"

dev: db-up ## Start development environment
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
	pnpm --filter @accountable-books/api seed:local

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

##@ Build & Test
build: ## Build all packages
	@echo "$(GREEN)Building all packages...$(RESET)"
	pnpm build

test: ## Run all tests
	@echo "$(GREEN)Running tests...$(RESET)"
	pnpm test

check: ## Run all quality checks (lint, typecheck, format)
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
	docker system prune -f
	pnpm clean || true
	@echo "$(GREEN)✅ Workspace cleaned$(RESET)"

reset: clean setup ## Full reset: clean everything and setup fresh
	@echo "$(GREEN)✅ Full reset complete$(RESET)"