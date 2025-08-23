#!/bin/bash

# =============================================================================
# Staging Deployment Script for Accountable Books
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Configuration
COMPOSE_FILE="docker-compose.staging.yml"
SECRETS_FILE=".env.staging.secrets"
ENV_FILE="apps/api/.env.staging"

# Pre-deployment checks
perform_checks() {
    log_info "Performing pre-deployment checks..."
    
    # Check if compose file exists
    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "Compose file $COMPOSE_FILE not found!"
        exit 1
    fi
    
    # Check if environment file exists
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file $ENV_FILE not found!"
        log_info "Run: cd apps/api && pnpm run generate-env"
        exit 1
    fi
    
    # Check if secrets file exists
    if [ ! -f "$SECRETS_FILE" ]; then
        log_warning "Secrets file $SECRETS_FILE not found!"
        log_info "Copy from template: cp .env.staging.secrets.template $SECRETS_FILE"
        log_info "Then edit the secrets with real values"
        exit 1
    fi
    
    # Check Docker and Docker Compose
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed!"
        exit 1
    fi
    
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed!"
        exit 1
    fi
    
    log_success "All checks passed!"
}

# Build and start services
deploy_services() {
    log_info "Building and starting staging services..."
    
    # Stop existing services
    log_info "Stopping existing services..."
    docker compose -f "$COMPOSE_FILE" down --remove-orphans || true
    
    # Build fresh images
    log_info "Building fresh images..."
    docker compose -f "$COMPOSE_FILE" build --no-cache
    
    # Start services
    log_info "Starting services..."
    docker compose -f "$COMPOSE_FILE" up -d
    
    log_success "Services started!"
}

# Wait for services to be healthy
wait_for_services() {
    log_info "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker compose -f "$COMPOSE_FILE" ps --filter "status=running" --filter "health=healthy" | grep -q "api.*healthy"; then
            log_success "API service is healthy!"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            log_error "Services failed to start properly after $max_attempts attempts"
            docker compose -f "$COMPOSE_FILE" logs --tail=50
            exit 1
        fi
        
        log_info "Attempt $attempt/$max_attempts - waiting for services... (10s)"
        sleep 10
        ((attempt++))
    done
}

# Run smoke tests
run_smoke_tests() {
    log_info "Running smoke tests..."
    
    # Test API health endpoint
    if curl -f -s http://localhost:5000/health >/dev/null; then
        log_success "API health check passed!"
    else
        log_error "API health check failed!"
        return 1
    fi
    
    # Test web app
    if curl -f -s http://localhost:3000/ >/dev/null; then
        log_success "Web app health check passed!"
    else
        log_error "Web app health check failed!"
        return 1
    fi
    
    # Test ML engine (if enabled)
    if docker compose -f "$COMPOSE_FILE" ps --services | grep -q "ml"; then
        if curl -f -s http://localhost:8000/health >/dev/null; then
            log_success "ML engine health check passed!"
        else
            log_warning "ML engine health check failed (non-critical)"
        fi
    fi
    
    log_success "All smoke tests passed!"
}

# Show deployment status
show_status() {
    log_info "Deployment Status:"
    echo
    docker compose -f "$COMPOSE_FILE" ps
    echo
    log_info "Service URLs:"
    echo "  🌐 Web App: http://localhost:3000"
    echo "  🔌 API: http://localhost:5000"
    echo "  📊 ML Engine: http://localhost:8000"
    echo "  📈 Bull Board: http://localhost:5000/admin/queues"
    echo
    log_info "Useful commands:"
    echo "  📋 View logs: docker compose -f $COMPOSE_FILE logs -f [service]"
    echo "  🔄 Restart: docker compose -f $COMPOSE_FILE restart [service]"
    echo "  🛑 Stop all: docker compose -f $COMPOSE_FILE down"
    echo "  🗄️  Database shell: docker compose -f $COMPOSE_FILE exec db psql -U user -d accountable_books"
}

# Cleanup on error
cleanup() {
    if [ $? -ne 0 ]; then
        log_error "Deployment failed! Cleaning up..."
        docker compose -f "$COMPOSE_FILE" logs --tail=100
        docker compose -f "$COMPOSE_FILE" down --remove-orphans
    fi
}

# Main deployment flow
main() {
    log_info "Starting Accountable Books staging deployment..."
    echo
    
    # Set trap for cleanup
    trap cleanup EXIT
    
    perform_checks
    deploy_services
    wait_for_services
    
    if run_smoke_tests; then
        log_success "🎉 Staging deployment completed successfully!"
        show_status
    else
        log_error "Smoke tests failed!"
        exit 1
    fi
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "stop")
        log_info "Stopping staging services..."
        docker compose -f "$COMPOSE_FILE" down --remove-orphans
        log_success "Services stopped!"
        ;;
    "logs")
        docker compose -f "$COMPOSE_FILE" logs -f "${2:-}"
        ;;
    "status")
        docker compose -f "$COMPOSE_FILE" ps
        ;;
    "clean")
        log_info "Cleaning up staging environment..."
        docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans
        docker system prune -f
        log_success "Environment cleaned!"
        ;;
    *)
        echo "Usage: $0 {deploy|stop|logs [service]|status|clean}"
        echo "  deploy - Deploy staging environment (default)"
        echo "  stop   - Stop all services"
        echo "  logs   - View logs (optionally for specific service)"
        echo "  status - Show service status"
        echo "  clean  - Clean up environment and volumes"
        exit 1
        ;;
esac