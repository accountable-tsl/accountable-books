# Advanced ML Engine operations (complements main Makefile)
# Use these for containerized operations or advanced debugging

.PHONY: ml-shell ml-logs ml-staging-up ml-staging-down ml-staging-logs

# ML container operations
ml-shell: ## Open shell in ML Engine container
	@echo "$(BLUE)🐚 Opening ML Engine container shell...$(RESET)"
	@docker compose -f docker-compose.staging.yml exec ml-engine bash

ml-logs: ## View ML Engine container logs
	@docker compose -f docker-compose.staging.yml logs -f --tail=100 ml-engine

# Staging ML management
ml-staging-up: guard-nonprod ## Start staging ML Engine container
	@echo "$(GREEN)🚀 Starting staging ML Engine...$(RESET)"
	@docker compose -f docker-compose.staging.yml up -d --build ml-engine

ml-staging-down: guard-nonprod ## Stop staging ML Engine container
	@echo "$(YELLOW)🛑 Stopping staging ML Engine...$(RESET)"
	@docker compose -f docker-compose.staging.yml stop ml-engine

ml-staging-logs: ## View staging ML Engine logs
	@docker compose -f docker-compose.staging.yml logs -f --tail=100 ml-engine

# ML-specific development commands
ml-only: guard-nonprod ## Start only ML Engine in development (not via Turbo)
	@echo "$(GREEN)🎯 Starting ML Engine only...$(RESET)"
	@echo "$(YELLOW)🔨 Ensuring contracts are built...$(RESET)"
	@pnpm -F @accountable-books/contracts run build || true
	@cd apps/ml-engine && poetry run uvicorn main:app --reload --host 0.0.0.0 --port 8002

ml-install: ## Install ML Engine Python dependencies
	@echo "$(GREEN)🐍 Installing ML Engine Python dependencies...$(RESET)"
	@cd apps/ml-engine && poetry install --no-interaction --no-ansi

ml-build-local: ## Build ML Engine locally (not for containers)
	@echo "$(GREEN)🔨 Building ML Engine locally...$(RESET)"
	@echo "$(YELLOW)Note: ML Engine uses Poetry for dependency management$(RESET)"

ml-test-local: ## Run ML Engine tests locally
	@echo "$(GREEN)🧪 Running ML Engine tests locally...$(RESET)"
	@cd apps/ml-engine && poetry run pytest

ml-lint-local: ## Run ML Engine linting locally
	@echo "$(GREEN)🔍 Running ML Engine linting locally...$(RESET)"
	@cd apps/ml-engine && poetry run ruff check . && poetry run black --check .

ml-format-local: ## Format ML Engine code locally
	@echo "$(GREEN)🎨 Formatting ML Engine code...$(RESET)"
	@cd apps/ml-engine && poetry run black .