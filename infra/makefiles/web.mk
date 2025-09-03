# 🌐 Web App Operations
# Simple, clean web development commands

.PHONY: web-only web-dev web-build web-test web-lint
.PHONY: web-staging-up web-staging-down web-staging-logs
.PHONY: web-shell web-logs

# =============================================================================
# 🚀 BASIC WEB DEVELOPMENT
# =============================================================================

web-only: guard-nonprod ## Start Web App only in development mode (not via Turbo)
	@echo "$(GREEN)🎯 Starting Web App only...$(RESET)"
	@pnpm -F @accountable-books/web run dev

web-dev: web-only ## Start Web App in development mode (alias for web-only)

web-build: ## Build Web App for production
	@echo "$(GREEN)🔨 Building Web App...$(RESET)"
	@pnpm -F @accountable-books/web run build

web-test: ## Run Web App tests
	@echo "$(GREEN)🧪 Running Web App tests...$(RESET)"
	@pnpm -F @accountable-books/web run test

web-lint: ## Run Web App linting
	@echo "$(GREEN)🔍 Running Web App linting...$(RESET)"
	@pnpm -F @accountable-books/web run lint

# =============================================================================
# 🚀 STAGING ENVIRONMENT
# =============================================================================

web-staging-up: guard-nonprod ## Start staging Web App container
	@echo "$(GREEN)🚀 Starting staging Web App...$(RESET)"
	@docker compose -f docker-compose.staging.yml up -d --build web

web-staging-down: guard-nonprod ## Stop staging Web App container
	@echo "$(YELLOW)🛑 Stopping staging Web App...$(RESET)"
	@docker compose -f docker-compose.staging.yml stop web

web-staging-logs: ## View staging Web App logs
	@docker compose -f docker-compose.staging.yml logs -f --tail=100 web

# =============================================================================
# 🔧 DEBUGGING
# =============================================================================

web-shell: ## Open shell in Web App container
	@echo "$(BLUE)🐚 Opening Web App container shell...$(RESET)"
	@docker compose -f docker-compose.staging.yml exec web sh

web-logs: ## View Web App container logs
	@docker compose -f docker-compose.staging.yml logs -f --tail=100 web