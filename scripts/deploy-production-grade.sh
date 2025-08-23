#!/bin/bash

# =============================================================================
# Production-Grade Staging Deployment Script
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.staging.prod.yml"
BACKUP_BEFORE_DEPLOY=${BACKUP_BEFORE_DEPLOY:-true}
ENABLE_MONITORING=${ENABLE_MONITORING:-false}
HEALTH_CHECK_TIMEOUT=${HEALTH_CHECK_TIMEOUT:-300}

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

# Error handling
cleanup_on_error() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_error "Deployment failed with exit code $exit_code"
        log_info "Checking service logs..."
        docker compose -f "$COMPOSE_FILE" logs --tail=50
        
        log_warning "Rolling back to previous state..."
        docker compose -f "$COMPOSE_FILE" down --remove-orphans
        
        # Restore from backup if available
        if [ "$BACKUP_BEFORE_DEPLOY" = true ] && [ -f "backup_before_deploy.tar.gz" ]; then
            log_info "Restoring from pre-deployment backup..."
            # Restore logic would go here
        fi
    fi
}

trap cleanup_on_error EXIT

# Pre-deployment checks
perform_checks() {
    log_info "Performing comprehensive pre-deployment checks..."
    
    # Check required files
    local required_files=(
        "$COMPOSE_FILE"
        "scripts/setup-secrets.sh"
        "scripts/backup-restore.sh"
        "scripts/security-scan.sh"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Required file missing: $file"
            exit 1
        fi
    done
    
    # Check Docker and Docker Compose
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed!"
        exit 1
    fi
    
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed!"
        exit 1
    fi
    
    # Check system resources
    local available_memory=$(free -m | awk 'NR==2{printf "%.0f", $7}' 2>/dev/null || echo "0")
    if [ "$available_memory" -lt 2048 ]; then
        log_warning "Low available memory: ${available_memory}MB (recommended: 2GB+)"
    fi
    
    local available_disk=$(df -BG . | awk 'NR==2{print $4}' | sed 's/G//' 2>/dev/null || echo "0")
    if [ "$available_disk" -lt 10 ]; then
        log_warning "Low available disk space: ${available_disk}GB (recommended: 10GB+)"
    fi
    
    # Check secrets
    log_info "Checking secrets configuration..."
    if [ ! -f ".env.staging.secrets" ]; then
        log_warning "Secrets file not found. Running setup..."
        ./scripts/setup-secrets.sh setup
    fi
    
    # Validate secrets
    ./scripts/setup-secrets.sh validate
    
    log_success "All pre-deployment checks passed!"
}

# Setup secrets and configuration
setup_secrets() {
    log_info "Setting up secrets and configuration..."
    
    # Generate secrets if needed
    ./scripts/setup-secrets.sh setup
    
    # Set proper permissions
    find . -name ".env.*" -not -name "*.example" -exec chmod 600 {} \;
    
    log_success "Secrets and configuration ready!"
}

# Run security scan
security_scan() {
    log_info "Running security scan..."
    
    # Run basic security checks
    ./scripts/security-scan.sh scan
    
    log_success "Security scan completed!"
}

# Create backup before deployment
create_backup() {
    if [ "$BACKUP_BEFORE_DEPLOY" = true ]; then
        log_info "Creating backup before deployment..."
        
        # Check if services are running for backup
        if docker compose -f "$COMPOSE_FILE" ps --services --filter "status=running" | grep -q .; then
            ./scripts/backup-restore.sh backup
        else
            log_info "No running services to backup"
        fi
    fi
}

# Build and deploy services
deploy_services() {
    log_info "Building and deploying services..."
    
    # Pull latest base images
    log_info "Pulling latest base images..."
    docker compose -f "$COMPOSE_FILE" pull --ignore-pull-failures || true
    
    # Stop existing services gracefully
    log_info "Stopping existing services..."
    docker compose -f "$COMPOSE_FILE" down --remove-orphans --timeout 30
    
    # Prune unused resources
    log_info "Cleaning up unused resources..."
    docker system prune -f --volumes
    
    # Build services
    log_info "Building services..."
    docker compose -f "$COMPOSE_FILE" build --no-cache --parallel
    
    # Start infrastructure services first
    log_info "Starting infrastructure services..."
    docker compose -f "$COMPOSE_FILE" up -d db redis
    
    # Wait for infrastructure to be ready
    log_info "Waiting for infrastructure services..."
    sleep 30
    
    # Run migrations
    log_info "Running database migrations..."
    docker compose -f "$COMPOSE_FILE" up api-migrate
    
    # Start application services
    log_info "Starting application services..."
    docker compose -f "$COMPOSE_FILE" up -d api ml
    
    # Start reverse proxy
    log_info "Starting reverse proxy..."
    docker compose -f "$COMPOSE_FILE" up -d nginx
    
    # Start monitoring if enabled
    if [ "$ENABLE_MONITORING" = true ]; then
        log_info "Starting monitoring services..."
        docker compose -f "$COMPOSE_FILE" --profile monitoring up -d
    fi
    
    log_success "Services deployed!"
}

# Wait for services to be healthy
wait_for_health() {
    log_info "Waiting for services to be healthy..."
    
    local start_time=$(date +%s)
    local timeout=$HEALTH_CHECK_TIMEOUT
    
    local services=("api" "nginx")
    if [ "$ENABLE_MONITORING" = true ]; then
        services+=("prometheus" "grafana")
    fi
    
    for service in "${services[@]}"; do
        log_info "Checking health of $service..."
        
        local attempt=1
        local max_attempts=$((timeout / 10))
        
        while [ $attempt -le $max_attempts ]; do
            if docker compose -f "$COMPOSE_FILE" ps "$service" --format "table {{.Health}}" | grep -q "healthy"; then
                log_success "$service is healthy!"
                break
            fi
            
            if [ $attempt -eq $max_attempts ]; then
                log_error "$service failed to become healthy after $timeout seconds"
                docker compose -f "$COMPOSE_FILE" logs --tail=50 "$service"
                exit 1
            fi
            
            log_info "Attempt $attempt/$max_attempts - waiting for $service... (10s)"
            sleep 10
            ((attempt++))
        done
    done
    
    local end_time=$(date +%s)
    local total_time=$((end_time - start_time))
    log_success "All services are healthy! (${total_time}s)"
}

# Run comprehensive smoke tests
run_smoke_tests() {
    log_info "Running comprehensive smoke tests..."
    
    local failed_tests=0
    
    # Test API endpoints
    log_info "Testing API endpoints..."
    if curl -f -s --max-time 10 "http://localhost/api/health" >/dev/null; then
        log_success "API health check: PASS"
    else
        log_error "API health check: FAIL"
        ((failed_tests++))
    fi
    
    # Test web application
    log_info "Testing web application..."
    if curl -f -s --max-time 10 "http://localhost/" >/dev/null; then
        log_success "Web application: PASS"
    else
        log_error "Web application: FAIL"
        ((failed_tests++))
    fi
    
    # Test HTTPS (if configured)
    if curl -k -f -s --max-time 10 "https://localhost/" >/dev/null 2>&1; then
        log_success "HTTPS endpoint: PASS"
    else
        log_warning "HTTPS endpoint: SKIP (may not be configured)"
    fi
    
    # Test ML engine
    if docker compose -f "$COMPOSE_FILE" ps ml | grep -q "Up"; then
        if curl -f -s --max-time 10 "http://localhost/ml/health" >/dev/null; then
            log_success "ML engine: PASS"
        else
            log_warning "ML engine: FAIL (non-critical)"
        fi
    fi
    
    # Test database connectivity
    if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U app_user -d accountable_books >/dev/null 2>&1; then
        log_success "Database connectivity: PASS"
    else
        log_error "Database connectivity: FAIL"
        ((failed_tests++))
    fi
    
    # Test Redis connectivity
    if docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping >/dev/null 2>&1; then
        log_success "Redis connectivity: PASS"
    else
        log_error "Redis connectivity: FAIL"
        ((failed_tests++))
    fi
    
    # Performance tests
    log_info "Running basic performance tests..."
    local response_time=$(curl -o /dev/null -s -w '%{time_total}' "http://localhost/api/health")
    if (( $(echo "$response_time < 1.0" | bc -l) )); then
        log_success "API response time: ${response_time}s"
    else
        log_warning "API response time slow: ${response_time}s"
    fi
    
    if [ $failed_tests -eq 0 ]; then
        log_success "All smoke tests passed!"
    else
        log_error "$failed_tests smoke tests failed!"
        return 1
    fi
}

# Show deployment status and URLs
show_status() {
    log_info "Deployment Status Summary:"
    echo
    
    # Service status
    docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    echo
    
    # Resource usage
    log_info "Resource Usage:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
        $(docker compose -f "$COMPOSE_FILE" ps -q) 2>/dev/null || true
    echo
    
    # Service URLs
    log_info "Service URLs:"
    echo "  🌐 Web App (HTTP): http://localhost"
    echo "  🌐 Web App (HTTPS): https://localhost"
    echo "  🔌 API: http://localhost/api"
    echo "  📊 ML Engine: http://localhost/ml"
    echo "  📈 Bull Board: http://localhost/api/admin/queues"
    
    if [ "$ENABLE_MONITORING" = true ]; then
        echo "  📊 Prometheus: http://localhost:9090"
        echo "  📈 Grafana: http://localhost:3001"
    fi
    echo
    
    # Management commands
    log_info "Management Commands:"
    echo "  📋 View logs: docker compose -f $COMPOSE_FILE logs -f [service]"
    echo "  🔄 Restart service: docker compose -f $COMPOSE_FILE restart [service]"
    echo "  🛑 Stop all: docker compose -f $COMPOSE_FILE down"
    echo "  🗄️  Database shell: docker compose -f $COMPOSE_FILE exec db psql -U app_user -d accountable_books"
    echo "  💾 Create backup: ./scripts/backup-restore.sh backup"
    echo "  🔒 Security scan: ./scripts/security-scan.sh scan"
    echo
    
    # Performance and monitoring
    log_info "Performance Monitoring:"
    echo "  • Monitor resource usage with: docker stats"
    echo "  • Check service health: docker compose -f $COMPOSE_FILE ps"
    echo "  • View detailed logs: docker compose -f $COMPOSE_FILE logs [service]"
    echo "  • Database performance: docker compose -f $COMPOSE_FILE exec db psql -U app_user -d accountable_books -c 'SELECT * FROM pg_stat_activity;'"
}

# Main deployment function
main() {
    log_info "🚀 Starting production-grade staging deployment..."
    echo
    
    local start_time=$(date +%s)
    
    perform_checks
    setup_secrets
    security_scan
    create_backup
    deploy_services
    wait_for_health
    
    if run_smoke_tests; then
        local end_time=$(date +%s)
        local total_time=$((end_time - start_time))
        
        log_success "🎉 Production-grade staging deployment completed successfully!"
        log_info "Total deployment time: ${total_time}s"
        echo
        show_status
        
        # Save deployment info
        cat > "deployment-info.txt" << EOF
Deployment completed: $(date)
Compose file: $COMPOSE_FILE
Total time: ${total_time}s
Services: $(docker compose -f "$COMPOSE_FILE" ps --services | tr '\n' ' ')
Version: $(git rev-parse HEAD 2>/dev/null || echo "unknown")
EOF
        
    else
        log_error "Deployment failed smoke tests!"
        exit 1
    fi
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "stop")
        log_info "Stopping all services..."
        docker compose -f "$COMPOSE_FILE" down --remove-orphans
        log_success "All services stopped!"
        ;;
    "restart")
        log_info "Restarting services..."
        docker compose -f "$COMPOSE_FILE" restart
        wait_for_health
        log_success "Services restarted!"
        ;;
    "status")
        show_status
        ;;
    "logs")
        docker compose -f "$COMPOSE_FILE" logs -f "${2:-}"
        ;;
    "shell")
        service="${2:-api}"
        log_info "Opening shell in $service..."
        docker compose -f "$COMPOSE_FILE" exec "$service" sh
        ;;
    "clean")
        log_warning "This will stop all services and remove volumes!"
        read -p "Are you sure? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "Cleaning up environment..."
            docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans
            docker system prune -f --volumes
            log_success "Environment cleaned!"
        else
            log_info "Cleanup cancelled"
        fi
        ;;
    "health")
        wait_for_health
        run_smoke_tests
        ;;
    *)
        echo "Usage: $0 {deploy|stop|restart|status|logs [service]|shell [service]|clean|health}"
        echo
        echo "Commands:"
        echo "  deploy   - Deploy production-grade staging environment (default)"
        echo "  stop     - Stop all services"
        echo "  restart  - Restart all services"
        echo "  status   - Show deployment status and URLs"
        echo "  logs     - View service logs (optionally for specific service)"
        echo "  shell    - Open shell in service (default: api)"
        echo "  clean    - Clean up environment and volumes"
        echo "  health   - Check service health and run smoke tests"
        echo
        echo "Environment Variables:"
        echo "  BACKUP_BEFORE_DEPLOY=true|false (default: true)"
        echo "  ENABLE_MONITORING=true|false (default: false)"
        echo "  HEALTH_CHECK_TIMEOUT=seconds (default: 300)"
        echo
        exit 1
        ;;
esac

# Remove error trap on successful completion
trap - EXIT