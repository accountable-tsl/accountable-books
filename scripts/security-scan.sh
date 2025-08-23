#!/bin/bash

# =============================================================================
# Security Scanning Script for Staging Environment
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

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install security tools if needed
install_security_tools() {
    log_info "Checking security tools..."
    
    # Check for Docker security tools
    if ! command_exists trivy; then
        log_warning "Trivy not found. Install with: brew install trivy"
    fi
    
    if ! command_exists hadolint; then
        log_warning "Hadolint not found. Install with: brew install hadolint"
    fi
    
    if ! command_exists docker; then
        log_error "Docker not found. Please install Docker first."
        exit 1
    fi
}

# Scan Dockerfiles for security issues
scan_dockerfiles() {
    log_info "Scanning Dockerfiles for security issues..."
    
    local dockerfiles=(
        "apps/api/Dockerfile"
        "apps/web/Dockerfile"
        "apps/ml-engine/Dockerfile"
        "infra/postgres/Dockerfile"
        "infra/nginx/Dockerfile"
    )
    
    for dockerfile in "${dockerfiles[@]}"; do
        if [ -f "$dockerfile" ]; then
            log_info "Scanning $dockerfile..."
            if command_exists hadolint; then
                hadolint "$dockerfile" || log_warning "Security issues found in $dockerfile"
            else
                log_warning "Skipping $dockerfile - hadolint not available"
            fi
        fi
    done
}

# Scan container images for vulnerabilities
scan_images() {
    log_info "Scanning container images for vulnerabilities..."
    
    if ! command_exists trivy; then
        log_warning "Trivy not available - skipping image vulnerability scan"
        return
    fi
    
    # Build images first
    log_info "Building images for scanning..."
    docker compose -f docker-compose.staging.prod.yml build --no-cache
    
    # Scan each image
    local images=(
        "accountable-books-api"
        "accountable-books-web"
        "accountable-books-ml"
        "accountable-books-nginx"
        "accountable-books-db"
    )
    
    for image in "${images[@]}"; do
        log_info "Scanning $image for vulnerabilities..."
        trivy image --severity HIGH,CRITICAL "$image" || log_warning "Vulnerabilities found in $image"
    done
}

# Check file permissions
check_file_permissions() {
    log_info "Checking file permissions..."
    
    # Check secrets directory
    if [ -d "secrets" ]; then
        local secrets_perms=$(stat -c %a "secrets" 2>/dev/null || stat -f %Lp "secrets")
        if [ "$secrets_perms" != "700" ]; then
            log_warning "Secrets directory permissions: $secrets_perms (should be 700)"
        else
            log_success "Secrets directory permissions: OK"
        fi
        
        # Check individual secret files
        for secret_file in secrets/*.txt; do
            if [ -f "$secret_file" ]; then
                local file_perms=$(stat -c %a "$secret_file" 2>/dev/null || stat -f %Lp "$secret_file")
                if [ "$file_perms" != "600" ]; then
                    log_warning "Secret file $secret_file permissions: $file_perms (should be 600)"
                else
                    log_success "Secret file $secret_file permissions: OK"
                fi
            fi
        done
    fi
    
    # Check environment files
    for env_file in .env.* apps/*/.env.*; do
        if [ -f "$env_file" ] && [[ "$env_file" != *.example ]]; then
            local env_perms=$(stat -c %a "$env_file" 2>/dev/null || stat -f %Lp "$env_file")
            if [ "$env_perms" != "600" ]; then
                log_warning "Environment file $env_file permissions: $env_perms (should be 600)"
            else
                log_success "Environment file $env_file permissions: OK"
            fi
        fi
    done
}

# Check for hardcoded secrets
check_hardcoded_secrets() {
    log_info "Checking for hardcoded secrets..."
    
    # Patterns to look for
    local secret_patterns=(
        "password.*=.*['\"][^'\"]{8,}['\"]"
        "secret.*=.*['\"][^'\"]{16,}['\"]"
        "key.*=.*['\"][^'\"]{16,}['\"]"
        "token.*=.*['\"][^'\"]{16,}['\"]"
        "api[_-]?key.*=.*['\"][^'\"]{8,}['\"]"
    )
    
    local found_secrets=false
    
    for pattern in "${secret_patterns[@]}"; do
        local matches=$(grep -r -E -i "$pattern" . \
            --exclude-dir=node_modules \
            --exclude-dir=.git \
            --exclude-dir=dist \
            --exclude="*.log" \
            --exclude="*.example" \
            --exclude="security-scan.sh" \
            2>/dev/null || true)
        
        if [ -n "$matches" ]; then
            log_warning "Potential hardcoded secrets found:"
            echo "$matches"
            found_secrets=true
        fi
    done
    
    if [ "$found_secrets" = false ]; then
        log_success "No hardcoded secrets detected"
    fi
}

# Check Docker Compose security
check_compose_security() {
    log_info "Checking Docker Compose security configuration..."
    
    local compose_file="docker-compose.staging.prod.yml"
    
    if [ ! -f "$compose_file" ]; then
        log_error "Production compose file not found: $compose_file"
        return 1
    fi
    
    # Check for security features
    local security_checks=(
        "security_opt.*no-new-privileges"
        "read_only.*true"
        "cap_drop"
        "networks"
        "secrets"
    )
    
    for check in "${security_checks[@]}"; do
        if grep -q "$check" "$compose_file"; then
            log_success "Security feature found: $check"
        else
            log_warning "Security feature missing: $check"
        fi
    done
    
    # Check for exposed ports
    local exposed_ports=$(grep -E "ports:" "$compose_file" | wc -l)
    if [ "$exposed_ports" -gt 3 ]; then
        log_warning "Many ports exposed ($exposed_ports) - consider reducing attack surface"
    else
        log_success "Minimal port exposure"
    fi
}

# Check network security
check_network_security() {
    log_info "Checking network security..."
    
    # Check for custom networks
    if grep -q "networks:" docker-compose.staging.prod.yml; then
        log_success "Custom networks configured"
    else
        log_warning "No custom networks - all services on default network"
    fi
    
    # Check for internal networks
    if grep -q "internal.*true" docker-compose.staging.prod.yml; then
        log_success "Internal networks configured"
    else
        log_warning "No internal networks - database may be accessible from other services"
    fi
}

# Generate security report
generate_report() {
    local report_file="security-report-$(date +%Y%m%d-%H%M%S).txt"
    
    log_info "Generating security report: $report_file"
    
    cat > "$report_file" << EOF
# Security Scan Report
Generated: $(date)
Environment: Staging

## Summary
This report contains the security assessment of the Accountable Books staging environment.

## Recommendations
1. Regularly update base images and dependencies
2. Use external secret management in production
3. Implement vulnerability scanning in CI/CD pipeline
4. Set up log monitoring and alerting
5. Regular security audits and penetration testing

## Next Steps
- Review all warnings in this scan
- Fix critical and high-severity vulnerabilities
- Implement automated security scanning
- Update incident response procedures

EOF

    log_success "Security report generated: $report_file"
}

# Main security scan
main() {
    log_info "Starting security scan for staging environment..."
    echo
    
    install_security_tools
    scan_dockerfiles
    scan_images
    check_file_permissions
    check_hardcoded_secrets
    check_compose_security
    check_network_security
    generate_report
    
    log_success "🔒 Security scan completed!"
    echo
    log_warning "Review all warnings and fix critical issues before production deployment"
}

# Handle script arguments
case "${1:-scan}" in
    "scan")
        main
        ;;
    "dockerfiles")
        scan_dockerfiles
        ;;
    "images")
        scan_images
        ;;
    "permissions")
        check_file_permissions
        ;;
    "secrets")
        check_hardcoded_secrets
        ;;
    "compose")
        check_compose_security
        ;;
    "network")
        check_network_security
        ;;
    *)
        echo "Usage: $0 {scan|dockerfiles|images|permissions|secrets|compose|network}"
        echo "  scan        - Run full security scan (default)"
        echo "  dockerfiles - Scan Dockerfiles only"
        echo "  images      - Scan container images only"
        echo "  permissions - Check file permissions only"
        echo "  secrets     - Check for hardcoded secrets only"
        echo "  compose     - Check Docker Compose security only"
        echo "  network     - Check network security only"
        exit 1
        ;;
esac