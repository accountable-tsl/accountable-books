# 🗄️ Complete Database Operations Suite
# All database-related commands consolidated in one place for better DX

.PHONY: db-up db-down db-logs db-migrate db-seed db-reset db-rollback db-wait db-shell
.PHONY: db-staging-up db-staging-down db-staging-logs db-staging-migrate db-staging-rollback
.PHONY: staging-up staging-down staging-logs staging-status staging-full-up staging-full-down
.PHONY: staging-health deploy-staging-check deploy-production-check

# =============================================================================
# 🚀 BASIC DATABASE OPERATIONS (Local Development)
# =============================================================================

db-up: guard-nonprod ## Start database and redis for local development
	@echo "$(GREEN)🐳 Starting database and redis...$(RESET)"
	@docker compose -f docker-compose.dev.yml up -d --build db redis

db-down: guard-nonprod ## Stop database and redis for local development
	@echo "$(YELLOW)🛑 Stopping database and redis...$(RESET)"
	@docker compose -f docker-compose.dev.yml down

db-logs: ## View local database logs
	@docker compose -f docker-compose.dev.yml logs -f --tail=100 db redis

db-migrate: guard-nonprod ## Run database migrations for local development
	@echo "$(GREEN)🗄️ Running migrations...$(RESET)"
	@pnpm -F @accountable-books/api migrate

db-seed: guard-nonprod ## Apply demo data for local development
	@echo "$(GREEN)🌱 Applying demo data...$(RESET)"
	@pnpm -F @accountable-books/api run demo:apply

# =============================================================================
# 🔧 ADVANCED DATABASE OPERATIONS (Local Development)
# =============================================================================

db-reset: guard-nonprod ## Reset database: rollback all migrations, then migrate fresh
	@echo "$(YELLOW)🔄 Resetting database...$(RESET)"
	@pnpm -F @accountable-books/api run db:reset
	@echo "$(GREEN)✅ Database reset complete$(RESET)"

db-rollback: guard-nonprod ## Rollback last migration
	@echo "$(YELLOW)⏪ Rolling back last migration...$(RESET)"
	@pnpm -F @accountable-books/api run rollback

db-wait: ## Wait for database to be ready
	@echo "$(YELLOW)⏳ Waiting for database...$(RESET)"
	@timeout 30 sh -c 'until docker compose -f docker-compose.dev.yml exec -T db pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB; do sleep 1; done' || (echo "$(RED)❌ Database failed to start$(RESET)" && exit 1)
	@echo "$(GREEN)✅ Database ready$(RESET)"

db-shell: ## Open PostgreSQL shell for local database
	@docker compose -f docker-compose.dev.yml exec db psql -U $$POSTGRES_USER -d $$POSTGRES_DB

# =============================================================================
# 🚀 STAGING ENVIRONMENT OPERATIONS
# =============================================================================

db-staging-up: guard-nonprod ## Start staging database and redis
	@echo "$(GREEN)🚀 Starting staging database...$(RESET)"
	@docker compose -f docker-compose.staging.yml up -d --build db redis

db-staging-down: guard-nonprod ## Stop staging database and redis
	@echo "$(YELLOW)🛑 Stopping staging database...$(RESET)"
	@docker compose -f docker-compose.staging.yml down

db-staging-logs: ## View staging database logs
	@docker compose -f docker-compose.staging.yml logs -f --tail=100 db redis

db-staging-migrate: ## Run migrations on staging (local staging environment)
	@echo "$(GREEN)🗄️ Running staging migrations...$(RESET)"
	@pnpm -F @accountable-books/api run migrate:staging

db-staging-rollback: ## Rollback migrations on staging (local staging environment)
	@echo "$(YELLOW)⏪ Rolling back staging migrations...$(RESET)"
	@pnpm -F @accountable-books/api run rollback:staging

# =============================================================================
# 🚀 FULL STAGING ENVIRONMENT MANAGEMENT
# =============================================================================

staging-up: guard-nonprod ## Start all staging services (db + api + web)
	@echo "$(GREEN)🚀 Starting staging environment...$(RESET)"
	@docker compose -f docker-compose.staging.yml up -d --build
	@echo "$(GREEN)✅ Staging environment started$(RESET)"

staging-down: guard-nonprod ## Stop all staging services
	@echo "$(YELLOW)🛑 Stopping staging environment...$(RESET)"
	@docker compose -f docker-compose.staging.yml down
	@echo "$(GREEN)✅ Staging environment stopped$(RESET)"

staging-logs: ## View all staging service logs
	@docker compose -f docker-compose.staging.yml logs -f --tail=50

staging-status: ## Show staging services status
	@echo "$(BLUE)📊 Staging environment status:$(RESET)"
	@docker compose -f docker-compose.staging.yml ps

staging-full-up: guard-nonprod ## Start staging + run migrations + seed
	@echo "$(GREEN)🚀 Starting full staging environment...$(RESET)"
	@$(MAKE) staging-up
	@echo "$(YELLOW)🗄️ Running staging migrations...$(RESET)"
	@pnpm -F @accountable-books/api run migrate:staging
	@echo "$(YELLOW)🌱 Applying staging demo data...$(RESET)"
	@pnpm -F @accountable-books/api run demo:apply:staging:local
	@echo "$(GREEN)✅ Full staging environment ready$(RESET)"

staging-full-down: guard-nonprod ## Stop staging + clean up
	@echo "$(YELLOW)🧹 Cleaning staging environment...$(RESET)"
	@docker compose -f docker-compose.staging.yml down -v --remove-orphans
	@echo "$(GREEN)✅ Staging environment cleaned$(RESET)"

# =============================================================================
# 🔍 HEALTH CHECKS & VALIDATION
# =============================================================================

staging-health: ## Check staging services health
	@echo "$(BLUE)🏥 Checking staging health...$(RESET)"
	@docker compose -f docker-compose.staging.yml ps
	@echo "$(YELLOW)API Health:$(RESET)"
	@curl -s http://localhost:5001/health/ready || echo "❌ API not responding"
	@echo "$(YELLOW)Web Health:$(RESET)"
	@curl -s http://localhost:3000 | head -1 || echo "❌ Web not responding"

deploy-staging-check: ## Run pre-deployment checks for staging
	@echo "$(GREEN)🔍 Running staging deployment checks...$(RESET)"
	@echo "$(YELLOW)Running tests...$(RESET)"
	@pnpm test
	@echo "$(YELLOW)Checking linting...$(RESET)"
	@pnpm lint
	@echo "$(GREEN)✅ Staging deployment checks passed$(RESET)"

deploy-production-check: ## Run pre-deployment checks for production
	@echo "$(RED)⚠️ Running production deployment checks...$(RESET)"
	@echo "$(YELLOW)Running tests...$(RESET)"
	@pnpm test
	@echo "$(YELLOW)Checking linting...$(RESET)"
	@pnpm lint
	@echo "$(YELLOW)Building packages...$(RESET)"
	@pnpm build
	@echo "$(GREEN)✅ Production deployment checks passed$(RESET)"