DRY_RUN ?=
DRY_RUN_PREFIX = $(if $(DRY_RUN),echo )

.PHONY: ml-dev ml-stg ml-% ml-%-build ml-%-up ml-%-down ml-%-logs ml-%-restart ml-%-status ml-%-shell ml-%-test ml-%-lint

ml-dev: ml-dev-up ## Start ML Engine for dev environment  
ml-stg: ml-staging-up ## Start ML Engine for staging environment
ml-down: ml-dev-down ## Stop ML Engine for dev environment

ml-%: ml-%-up ## Start ML Engine service for environment <env>

ml-%-build: ensure-% ## Build ML Engine image for environment <env>
	@echo "$(BLUE)Building ML Engine image for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) build ml-engine

ml-%-up: guard-nonprod ensure-% ## Start ML Engine service for environment <env>
	@if [ "$*" = "dev" ]; then \
		pnpm -F @accountable-books/ml-engine run dev; \
	else \
		@echo "$(GREEN)Starting ML Engine for env: $*$(RESET)"; \
		$(DRY_RUN_PREFIX)$(call compose_for,$*) up -d ml-engine; \
	fi

ml-%-down: guard-nonprod ensure-% ## Stop ML Engine service for environment <env>
	@echo "$(YELLOW)Stopping ML Engine for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) stop ml-engine

ml-%-logs: ensure-% ## Tail logs for ML Engine service in environment <env>
	$(DRY_RUN_PREFIX)$(call compose_for,$*) logs -f --tail=200 ml-engine

ml-%-restart: guard-nonprod ml-%-down ml-%-up ## Restart ML Engine service for environment <env>

ml-%-status: ensure-% ## Show status of ML Engine service for environment <env>
	@echo "$(BLUE)Checking ML Engine status for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) ps ml-engine

ml-%-shell: guard-nonprod ensure-% ## Open shell in ML Engine container for environment <env>
	@echo "$(BLUE)Opening shell in ML Engine container for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) exec ml-engine bash

ml-%-test: guard-nonprod ensure-% ## Run tests in ML Engine container for environment <env>
	@echo "$(GREEN)Running ML Engine tests for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) exec ml-engine pytest

ml-%-lint: guard-nonprod ensure-% ## Run linting in ML Engine container for environment <env>
	@echo "$(GREEN)Running ML Engine linting for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) exec ml-engine ruff check .
	$(DRY_RUN_PREFIX)$(call compose_for,$*) exec ml-engine black --check .

ml-print-loaded: ## Confirm ml.mk is loaded
	@echo "ml.mk loaded OK"