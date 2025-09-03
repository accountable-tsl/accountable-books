# 🚀 API Operations Suite
# Complete API development, testing, and deployment commands

.PHONY: api-only api-dev api-build api-test api-lint api-typecheck
.PHONY: api-migrate api-rollback api-db-reset
.PHONY: api-demo-apply api-demo-reverse api-demo-status
.PHONY: api-worker api-worker-dev
.PHONY: api-staging-up api-staging-down api-staging-logs
.PHONY: api-shell api-logs

# =============================================================================
# 🚀 DEVELOPMENT & BUILD
# =============================================================================

api-only: guard-nonprod ## Start API only in development mode (not via Turbo)
	@echo "$(GREEN)🎯 Starting API only...$(RESET)"
	@pnpm -F @accountable-books/api run dev

api-dev: api-only ## Start API in development mode (alias for api-only)

api-build: ## Build API for production
	@echo "$(GREEN)🔨 Building API...$(RESET)"
	@pnpm -F @accountable-books/api run build

# =============================================================================
# 🧪 TESTING & QUALITY
# =============================================================================

api-test: ## Run API tests
	@echo "$(GREEN)🧪 Running API tests...$(RESET)"
	@pnpm -F @accountable-books/api run test

api-test-watch: ## Run API tests in watch mode
	@echo "$(GREEN)👀 Running API tests in watch mode...$(RESET)"
	@pnpm -F @accountable-books/api run test:watch

api-test-coverage: ## Run API tests with coverage
	@echo "$(GREEN)📊 Running API tests with coverage...$(RESET)"
	@pnpm -F @accountable-books/api run test:coverage

api-lint: ## Run API linting
	@echo "$(GREEN)🔍 Running API linting...$(RESET)"
	@pnpm -F @accountable-books/api run lint

api-typecheck: ## Run API type checking
	@echo "$(GREEN)🔍 Running API type checking...$(RESET)"
	@pnpm -F @accountable-books/api run typecheck

# =============================================================================
# 🗄️ DATABASE OPERATIONS
# =============================================================================

api-migrate: guard-nonprod ## Run API database migrations
	@echo "$(GREEN)🗄️ Running API migrations...$(RESET)"
	@pnpm -F @accountable-books/api run migrate

api-migrate-test: guard-nonprod ## Run API database migrations for test environment
	@echo "$(GREEN)🗄️ Running API test migrations...$(RESET)"
	@pnpm -F @accountable-books/api run migrate:test

api-migrate-staging: guard-nonprod ## Run API database migrations for staging
	@echo "$(GREEN)🗄️ Running API staging migrations...$(RESET)"
	@pnpm -F @accountable-books/api run migrate:staging

api-rollback: guard-nonprod ## Rollback last API database migration
	@echo "$(YELLOW)⏪ Rolling back last API migration...$(RESET)"
	@pnpm -F @accountable-books/api run rollback

api-rollback-staging: guard-nonprod ## Rollback last API staging migration
	@echo "$(YELLOW)⏪ Rolling back last API staging migration...$(RESET)"
	@pnpm -F @accountable-books/api run rollback:staging

api-db-reset: guard-nonprod ## Reset API database (rollback all + migrate + seed)
	@echo "$(YELLOW)🔄 Resetting API database...$(RESET)"
	@pnpm -F @accountable-books/api run db:reset
	@echo "$(GREEN)✅ API database reset complete$(RESET)"

# =============================================================================
# 🌱 DEMO DATA MANAGEMENT
# =============================================================================

api-demo-apply: guard-nonprod ## Apply demo data for API
	@echo "$(GREEN)🌱 Applying API demo data...$(RESET)"
	@pnpm -F @accountable-books/api run demo:apply

api-demo-reverse: guard-nonprod ## Remove demo data for API
	@echo "$(YELLOW)🗑️ Removing API demo data...$(RESET)"
	@pnpm -F @accountable-books/api run demo:reverse

api-demo-status: ## Show API demo data status
	@pnpm -F @accountable-books/api run demo:status

# =============================================================================
# ⚙️ WORKERS & SERVICES
# =============================================================================

api-worker: guard-nonprod ## Start API worker
	@echo "$(GREEN)⚙️ Starting API worker...$(RESET)"
	@pnpm -F @accountable-books/api run worker

api-worker-dev: guard-nonprod ## Start API worker in development mode
	@echo "$(GREEN)⚙️ Starting API worker (dev mode)...$(RESET)"
	@pnpm -F @accountable-books/api run worker:dev

# =============================================================================
# 🚀 STAGING CONTAINER OPERATIONS
# =============================================================================

api-staging-up: guard-nonprod ## Start staging API container
	@echo "$(GREEN)🚀 Starting staging API...$(RESET)"
	@docker compose -f docker-compose.staging.yml up -d --build api

api-staging-down: guard-nonprod ## Stop staging API container
	@echo "$(YELLOW)🛑 Stopping staging API...$(RESET)"
	@docker compose -f docker-compose.staging.yml stop api

api-staging-logs: ## View staging API logs
	@docker compose -f docker-compose.staging.yml logs -f --tail=100 api

# =============================================================================
# 🔧 DEBUGGING & CONTAINER ACCESS
# =============================================================================

api-shell: ## Open shell in API container
	@echo "$(BLUE)🐚 Opening API container shell...$(RESET)"
	@docker compose -f docker-compose.staging.yml exec api sh

api-logs: ## View API container logs
	@docker compose -f docker-compose.staging.yml logs -f --tail=100 api