DRY_RUN ?=
DRY_RUN_PREFIX = $(if $(DRY_RUN),echo )

.PHONY: db-up db-dev db-stg db-% db-%-build db-%-build-redis db-%-build-postgres db-%-up db-%-up-postgres db-%-up-redis db-%-down db-%-logs db-%-restart db-%-nuke db-%-status

db-up: db-dev-up ## Start database and redis for dev environment (default)
db-dev: db-dev-up ## Start database and redis for dev environment
db-stg: db-staging-up ## Start database and redis for staging environment
db-down: db-dev-down ## Stop database and redis for dev environment
db-nuke: db-dev-nuke ## Destructive: stop services and remove volumes for dev environment


db-%: db-%-up ## Start database and redis services for environment <env>

db-%-build: ensure-% ## Build database and redis images for environment <env>
	@echo "$(BLUE)Building images for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) build db redis

db-%-build-redis: ensure-% ## Build only redis image for environment <env>
	@echo "$(BLUE)Building redis image for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) build redis

db-%-build-postgres: ensure-% ## Build only postgres image for environment <env>
	@echo "$(BLUE)Building postgres image for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) build db

db-%-up: guard-nonprod ensure-% ## Start database and redis services for environment <env>
	@echo "$(GREEN)Starting database services for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) up -d db redis

db-%-up-postgres: guard-nonprod ensure-% ## Start only postgres service for environment <env>
	@echo "$(GREEN)Starting postgres service for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) up -d db

db-%-up-redis: guard-nonprod ensure-% ## Start only redis service for environment <env>
	@echo "$(GREEN)Starting redis service for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) up -d redis

db-%-down: guard-nonprod ensure-% ## Stop database and redis services for environment <env>
	@echo "$(YELLOW)Stopping database services for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) down

db-%-logs: ensure-% ## Tail logs for database and redis services in environment <env>
	$(DRY_RUN_PREFIX)$(call compose_for,$*) logs -f --tail=200 db redis

db-%-restart: guard-nonprod db-%-down db-%-up ## Restart database and redis services for environment <env>

db-%-nuke: guard-nonprod ensure-% ## Destructive: stop services and remove volumes for environment <env>
	@echo "$(YELLOW)🧹 Nuking database for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) down -v

db-%-status: ensure-% ## Show status of database and redis services for environment <env>
	@echo "$(BLUE)Checking status for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) ps

db-%-wait: ensure-% ## Wait for database to be ready for environment <env>
	@echo "$(YELLOW)Waiting for database in env: $*...$(RESET)"
	@timeout $(WAIT_TIMEOUT) sh -c 'until $(call compose_for,$*) exec db pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB; do sleep 1; done' || (echo "$(RED)Database failed to start$(RESET)" && exit 1)
	@echo "$(GREEN)✅ Database ready for env: $*$(RESET)"

db-dev-migrate: ## Show status of database and redis services for environment <env>
	@echo "$(GREEN)Running migrations...$(RESET)"
	pnpm -F @accountable-books/api run migrate:local

db-dev-rollback: ## Show status of database and redis services for environment <env>
	@echo "$(GREEN)Rolling back migrations...$(RESET)"
	pnpm -F @accountable-books/api run migrate:rollback

db-print-loaded: ## Confirm db.mk is loaded
	@echo "db.mk loaded OK"