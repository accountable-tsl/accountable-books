DRY_RUN ?=
DRY_RUN_PREFIX = $(if $(DRY_RUN),echo )

.PHONY: api-dev api-stg api-% api-%-build api-%-up api-%-down api-%-logs api-%-restart api-%-status api-%-shell api-%-migrate api-%-seed api-%-test api-%-lint

api-dev: api-dev-up ## Start API in development mode
api-stg: api-staging-up ## Start API for staging environment
api-down: api-staging-down ## Stop API for staging environment

api-%: api-%-up ## Start API service for environment <env>

api-%-build: ensure-% ## Build API image for environment <env>
	@echo "$(BLUE)Building API image for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) build api

api-%-up: guard-nonprod ensure-% ## Start API service for environment <env>
	@if [ "$*" = "dev" ]; then \
		pnpm -F @accountable-books/api run dev; \
	else \
		echo "$(GREEN)Starting API for env: $*$(RESET)"; \
		$(DRY_RUN_PREFIX)$(call compose_for,$*) up -d api; \
	fi

api-%-down: guard-nonprod ensure-% ## Stop API service for environment <env>
	@if [ "$*" = "dev" ]; then \
		echo "$(YELLOW)ℹ️  For development, stop apps with Ctrl+C in your 'pnpm dev' session$(RESET)"; \
	else \
		echo "$(YELLOW)Stopping API for env: $*$(RESET)"; \
		$(DRY_RUN_PREFIX)$(call compose_for,$*) stop api; \
	fi

api-%-logs: ensure-% ## Tail logs for API service in environment <env>
	$(DRY_RUN_PREFIX)$(call compose_for,$*) logs -f --tail=200 api

api-%-restart: guard-nonprod api-%-down api-%-up ## Restart API service for environment <env>

api-%-status: ensure-% ## Show status of API service for environment <env>
	@echo "$(BLUE)Checking API status for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) ps api

api-%-shell: guard-nonprod ensure-% ## Open shell in API container for environment <env>
	@echo "$(BLUE)Opening shell in API container for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) exec api sh

api-%-migrate: guard-nonprod ensure-% ## Run database migrations for environment <env>
	@if [ "$*" = "dev" ]; then \
		echo "$(GREEN)Running migrations for dev (host-based)...$(RESET)"; \
		pnpm --filter @accountable-books/api migrate:local; \
	else \
		echo "$(GREEN)Running migrations for env: $*$(RESET)"; \
		$(DRY_RUN_PREFIX)$(call compose_for,$*) exec api sh -c "cd apps/api && pnpm run migrate:local"; \
	fi

api-%-seed: guard-nonprod ensure-% ## Apply demo seeds for environment <env>
	@if [ "$*" = "dev" ]; then \
		echo "$(GREEN)Applying demo seeds for dev (host-based)...$(RESET)"; \
		pnpm --filter @accountable-books/api demo:apply -- --all; \
	else \
		echo "$(GREEN)Applying demo seeds for env: $*$(RESET)"; \
		$(DRY_RUN_PREFIX)$(call compose_for,$*) exec api sh -c "cd apps/api && pnpm run demo:apply -- --all"; \
	fi

api-%-test: guard-nonprod ensure-% ## Run tests for environment <env>
	@if [ "$*" = "dev" ]; then \
		echo "$(GREEN)Running API tests for dev (host-based)...$(RESET)"; \
		pnpm --filter @accountable-books/api test; \
	else \
		echo "$(GREEN)Running API tests for env: $*$(RESET)"; \
		$(DRY_RUN_PREFIX)$(call compose_for,$*) exec api sh -c "cd apps/api && pnpm test"; \
	fi

api-%-lint: guard-nonprod ensure-% ## Run linting for environment <env>
	@if [ "$*" = "dev" ]; then \
		echo "$(GREEN)Running API linting for dev (host-based)...$(RESET)"; \
		pnpm --filter @accountable-books/api lint; \
	else \
		echo "$(GREEN)Running API linting for env: $*$(RESET)"; \
		$(DRY_RUN_PREFIX)$(call compose_for,$*) exec api sh -c "cd apps/api && pnpm lint"; \
	fi

api-print-loaded: ## Confirm api.mk is loaded
	@echo "api.mk loaded OK"