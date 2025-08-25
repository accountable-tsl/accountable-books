DRY_RUN ?=
DRY_RUN_PREFIX = $(if $(DRY_RUN),echo )

.PHONY: web-dev web-stg web-% web-%-build web-%-up web-%-down web-%-logs web-%-restart web-%-status web-%-shell web-%-test web-%-lint web-%-typecheck

web-dev: web-dev-up ## Start Web App for dev environment  
web-stg: web-staging-up ## Start Web App for staging environment
web-down: web-dev-down ## Stop Web App for dev environment

web-%: web-%-up ## Start Web App service for environment <env>

web-%-build: ensure-% ## Build Web App image for environment <env>
	@echo "$(BLUE)Building Web App image for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) build web

web-%-up: guard-nonprod ensure-% ## Start Web App service for environment <env>
	@if [ "$*" = "dev" ]; then \
		pnpm -F @accountable-books/web run dev; \
	else \
		@echo "$(GREEN)Starting Web App for env: $*$(RESET)"; \
		$(DRY_RUN_PREFIX)$(call compose_for,$*) up -d web; \
	fi

web-%-down: guard-nonprod ensure-% ## Stop Web App service for environment <env>
	@echo "$(YELLOW)Stopping Web App for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) stop web

web-%-logs: ensure-% ## Tail logs for Web App service in environment <env>
	$(DRY_RUN_PREFIX)$(call compose_for,$*) logs -f --tail=200 web

web-%-restart: guard-nonprod web-%-down web-%-up ## Restart Web App service for environment <env>

web-%-status: ensure-% ## Show status of Web App service for environment <env>
	@echo "$(BLUE)Checking Web App status for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) ps web

web-%-shell: guard-nonprod ensure-% ## Open shell in Web App container for environment <env>
	@echo "$(BLUE)Opening shell in Web App container for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) exec web sh

web-%-test: guard-nonprod ensure-% ## Run tests in Web App container for environment <env>
	@echo "$(GREEN)Running Web App tests for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) exec web sh -c "cd apps/web && pnpm test"

web-%-lint: guard-nonprod ensure-% ## Run linting in Web App container for environment <env>
	@echo "$(GREEN)Running Web App linting for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) exec web sh -c "cd apps/web && pnpm lint"

web-%-typecheck: guard-nonprod ensure-% ## Run type checking in Web App container for environment <env>
	@echo "$(GREEN)Running Web App type checking for env: $*$(RESET)"
	$(DRY_RUN_PREFIX)$(call compose_for,$*) exec web sh -c "cd apps/web && pnpm typecheck"

web-print-loaded: ## Confirm web.mk is loaded
	@echo "web.mk loaded OK"