# 🗄️ Database Operations
# Happy-path Make targets prepare BOTH local and test DBs.

.PHONY: db-up db-provision db-down db-logs db-wait db-shell
.PHONY: db-ready db-migrate db-seed db-reset db-rollback
.PHONY: db-migrate-local db-migrate-test db-seed-local db-seed-test
.PHONY: db-reset-local db-reset-test
.PHONY: db-staging-up db-staging-down db-staging-logs db-staging-migrate db-staging-rollback
.PHONY: staging-up staging-down staging-logs staging-status staging-full-up staging-full-down
.PHONY: staging-health deploy-staging-check deploy-production-check

# =============================================================================
# 🚀 INFRA (Docker creates both accountable_books and accountable_books_test)
# =============================================================================

db-up: guard-nonprod ## Start database and redis for local development
	@echo "$(GREEN)🐳 Starting database and redis...$(RESET)"
	@docker compose -f docker-compose.dev.yml up -d --build db redis
	@$(MAKE) db-provision

db-provision: guard-nonprod ## Create or repair local development databases
	@echo "$(GREEN)🛠️ Provisioning local databases...$(RESET)"
	@docker compose -f docker-compose.dev.yml run --rm db-init

db-down: guard-nonprod ## Stop database and redis for local development
	@echo "$(YELLOW)🛑 Stopping database and redis...$(RESET)"
	@docker compose -f docker-compose.dev.yml down

db-logs: ## View local database logs
	@docker compose -f docker-compose.dev.yml logs -f --tail=100 db redis

db-wait: ## Wait for database to be ready
	@echo "$(YELLOW)⏳ Waiting for database...$(RESET)"
	@timeout 30 sh -c 'until docker compose -f docker-compose.dev.yml exec -T db pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB; do sleep 1; done' || (echo "$(RED)❌ Database failed to start$(RESET)" && exit 1)
	@echo "$(GREEN)✅ Database ready$(RESET)"

db-shell: ## Open PostgreSQL shell for local database
	@docker compose -f docker-compose.dev.yml exec db psql -U $$POSTGRES_USER -d $$POSTGRES_DB

# =============================================================================
# 🎯 HAPPY PATH (local + test together)
# =============================================================================

db-ready: guard-nonprod ## Migrate + bootstrap local and test DBs
	@echo "$(GREEN)🗄️ Preparing local + test databases (migrate + bootstrap)...$(RESET)"
	@$(MAKE) db-migrate-local
	@$(MAKE) db-migrate-test
	@echo "$(GREEN)✅ Local and test databases are ready$(RESET)"

db-migrate: db-ready ## Alias for db-ready

db-seed: guard-nonprod ## Apply demo data to local and test DBs
	@echo "$(GREEN)🌱 Seeding demo data on local + test...$(RESET)"
	@$(MAKE) db-seed-local
	@$(MAKE) db-seed-test
	@echo "$(GREEN)✅ Demo data applied to local and test$(RESET)"

db-reset: guard-nonprod ## Reset, migrate, bootstrap, and seed local and test DBs
	@echo "$(YELLOW)🔄 Resetting local + test databases...$(RESET)"
	@$(MAKE) db-reset-local
	@$(MAKE) db-reset-test
	@echo "$(GREEN)✅ Local and test database reset complete$(RESET)"

# =============================================================================
# 🔧 ESCAPE HATCHES (single env — prefer happy-path targets above)
# =============================================================================

db-migrate-local: guard-nonprod ## Migrate + bootstrap local DB only
	@echo "$(GREEN)🗄️ [local] migrations...$(RESET)"
	@pnpm -F @accountable-books/api run migrate:local
	@echo "$(GREEN)📚 [local] bootstrap catalog...$(RESET)"
	@pnpm -F @accountable-books/api run bootstrap:local

db-migrate-test: guard-nonprod ## Migrate + bootstrap test DB only
	@echo "$(GREEN)🗄️ [test] migrations...$(RESET)"
	@pnpm -F @accountable-books/api run migrate:test
	@echo "$(GREEN)📚 [test] bootstrap catalog...$(RESET)"
	@pnpm -F @accountable-books/api run bootstrap:test

db-seed-local: guard-nonprod ## Apply demo data to local DB only
	@echo "$(GREEN)🌱 [local] demo apply...$(RESET)"
	@pnpm -F @accountable-books/api run demo apply

db-seed-test: guard-nonprod ## Apply demo data to test DB only
	@echo "$(GREEN)🌱 [test] demo apply...$(RESET)"
	@NODE_ENV=test pnpm -F @accountable-books/api run demo apply

db-reset-local: guard-nonprod ## Reset local DB, then migrate + bootstrap + seed
	@echo "$(YELLOW)🔄 [local] reset...$(RESET)"
	@pnpm -F @accountable-books/api run db:reset:local
	@$(MAKE) db-migrate-local
	@$(MAKE) db-seed-local

db-reset-test: guard-nonprod ## Reset test DB, then migrate + bootstrap + seed
	@echo "$(YELLOW)🔄 [test] reset...$(RESET)"
	@pnpm -F @accountable-books/api run db:reset:test
	@$(MAKE) db-migrate-test
	@$(MAKE) db-seed-test

db-rollback: guard-nonprod ## Rollback last local migration
	@echo "$(YELLOW)⏪ Rolling back last local migration...$(RESET)"
	@pnpm -F @accountable-books/api run rollback:local

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
	@NODE_ENV=staging LOCAL_STAGING=true pnpm -F @accountable-books/api run demo apply
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
