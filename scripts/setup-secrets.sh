#!/bin/bash

# =============================================================================
# Secrets Setup Script for Staging Environment
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
SECRETS_DIR="./secrets"
ENV_SECRETS_FILE=".env.staging.secrets"

# Generate secure random password
generate_password() {
    local length=${1:-32}
    openssl rand -base64 $((length * 3 / 4)) | tr -d '=+/' | cut -c1-${length}
}

# Generate JWT secret
generate_jwt_secret() {
    openssl rand -hex 32
}

# Setup secrets directory
setup_secrets_dir() {
    log_info "Setting up secrets directory..."
    
    # Create secrets directory if it doesn't exist
    if [ ! -d "$SECRETS_DIR" ]; then
        mkdir -p "$SECRETS_DIR"
        log_success "Created secrets directory"
    fi
    
    # Set proper permissions
    chmod 700 "$SECRETS_DIR"
    
    # Create .gitignore for secrets
    if [ ! -f "$SECRETS_DIR/.gitignore" ]; then
        echo "*" > "$SECRETS_DIR/.gitignore"
        echo "!.gitignore" >> "$SECRETS_DIR/.gitignore"
        log_success "Created secrets .gitignore"
    fi
}

# Generate database password
generate_db_password() {
    local password_file="$SECRETS_DIR/db_password.txt"
    
    if [ ! -f "$password_file" ]; then
        log_info "Generating database password..."
        generate_password 32 > "$password_file"
        chmod 600 "$password_file"
        log_success "Generated database password"
    else
        log_info "Database password already exists"
    fi
}

# Generate JWT secrets
generate_jwt_secrets() {
    local access_secret_file="$SECRETS_DIR/jwt_access_secret.txt"
    local refresh_secret_file="$SECRETS_DIR/jwt_refresh_secret.txt"
    
    if [ ! -f "$access_secret_file" ]; then
        log_info "Generating JWT access secret..."
        generate_jwt_secret > "$access_secret_file"
        chmod 600 "$access_secret_file"
        log_success "Generated JWT access secret"
    else
        log_info "JWT access secret already exists"
    fi
    
    if [ ! -f "$refresh_secret_file" ]; then
        log_info "Generating JWT refresh secret..."
        generate_jwt_secret > "$refresh_secret_file"
        chmod 600 "$refresh_secret_file"
        log_success "Generated JWT refresh secret"
    else
        log_info "JWT refresh secret already exists"
    fi
}

# Generate Redis password
generate_redis_password() {
    local password_file="$SECRETS_DIR/redis_password.txt"
    
    if [ ! -f "$password_file" ]; then
        log_info "Generating Redis password..."
        generate_password 24 > "$password_file"
        chmod 600 "$password_file"
        log_success "Generated Redis password"
    else
        log_info "Redis password already exists"
    fi
}

# Update environment secrets file
update_env_secrets() {
    log_info "Updating environment secrets file..."
    
    local db_password=$(cat "$SECRETS_DIR/db_password.txt")
    local redis_password=$(cat "$SECRETS_DIR/redis_password.txt")
    local jwt_access_secret=$(cat "$SECRETS_DIR/jwt_access_secret.txt")
    local jwt_refresh_secret=$(cat "$SECRETS_DIR/jwt_refresh_secret.txt")
    
    # Create or update .env.staging.secrets
    cat > "$ENV_SECRETS_FILE" << EOF
# =============================================================================
# STAGING SECRETS - AUTO-GENERATED
# =============================================================================
# NEVER commit this file to version control
# Generated on: $(date)

# Database credentials
POSTGRES_USER=app_user
POSTGRES_PASSWORD=${db_password}

# Redis credentials
REDIS_PASSWORD=${redis_password}

# Security secrets
CSRF_SECRET=$(generate_password 32)
JWT_ACCESS_SECRET=${jwt_access_secret}
JWT_REFRESH_SECRET=${jwt_refresh_secret}

# Admin credentials (change these!)
ADMIN_EMAIL=admin@staging.accountable.local
ADMIN_PASSWORD=$(generate_password 16)
BULLBOARD_PASSWORD=$(generate_password 16)

# External service API keys (add real keys when needed)
POSTMARK_API_KEY=
SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=
R2_TOKEN=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
MIXPANEL_TOKEN=
SENTRY_DSN=
EOF

    chmod 600 "$ENV_SECRETS_FILE"
    log_success "Updated environment secrets file"
}

# Validate secrets
validate_secrets() {
    log_info "Validating secrets..."
    
    local required_files=(
        "$SECRETS_DIR/db_password.txt"
        "$SECRETS_DIR/redis_password.txt"
        "$SECRETS_DIR/jwt_access_secret.txt"
        "$SECRETS_DIR/jwt_refresh_secret.txt"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Missing required secret file: $file"
            return 1
        fi
        
        if [ ! -s "$file" ]; then
            log_error "Secret file is empty: $file"
            return 1
        fi
        
        # Check file permissions
        local perms=$(stat -c %a "$file" 2>/dev/null || stat -f %Lp "$file")
        if [ "$perms" != "600" ]; then
            log_warning "Fixing permissions for $file"
            chmod 600 "$file"
        fi
    done
    
    log_success "All secrets validated"
}

# Show secrets summary (without revealing actual values)
show_summary() {
    log_info "Secrets Summary:"
    echo
    echo "📁 Secrets Directory: $SECRETS_DIR"
    echo "🔑 Database Password: $([ -f "$SECRETS_DIR/db_password.txt" ] && echo "✓ Generated" || echo "✗ Missing")"
    echo "🔑 Redis Password: $([ -f "$SECRETS_DIR/redis_password.txt" ] && echo "✓ Generated" || echo "✗ Missing")"
    echo "🔑 JWT Access Secret: $([ -f "$SECRETS_DIR/jwt_access_secret.txt" ] && echo "✓ Generated" || echo "✗ Missing")"
    echo "🔑 JWT Refresh Secret: $([ -f "$SECRETS_DIR/jwt_refresh_secret.txt" ] && echo "✓ Generated" || echo "✗ Missing")"
    echo "📋 Environment File: $([ -f "$ENV_SECRETS_FILE" ] && echo "✓ Updated" || echo "✗ Missing")"
    echo
    log_warning "Remember to:"
    echo "  1. Never commit secrets files to version control"
    echo "  2. Update admin credentials in $ENV_SECRETS_FILE"
    echo "  3. Add real API keys for external services"
    echo "  4. Use proper secret management in production"
}

# Main function
main() {
    log_info "Setting up secrets for staging environment..."
    echo
    
    setup_secrets_dir
    generate_db_password
    generate_redis_password
    generate_jwt_secrets
    update_env_secrets
    validate_secrets
    
    log_success "🎉 Secrets setup completed successfully!"
    show_summary
}

# Handle script arguments
case "${1:-setup}" in
    "setup")
        main
        ;;
    "regenerate")
        log_warning "This will regenerate ALL secrets and may break existing deployments!"
        read -p "Are you sure? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -f "$SECRETS_DIR"/*.txt "$ENV_SECRETS_FILE"
            main
        else
            log_info "Secrets regeneration cancelled"
        fi
        ;;
    "validate")
        validate_secrets
        show_summary
        ;;
    "clean")
        log_warning "This will delete ALL secrets!"
        read -p "Are you sure? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$SECRETS_DIR" "$ENV_SECRETS_FILE"
            log_success "Secrets cleaned"
        else
            log_info "Secrets cleanup cancelled"
        fi
        ;;
    *)
        echo "Usage: $0 {setup|regenerate|validate|clean}"
        echo "  setup      - Generate secrets (default)"
        echo "  regenerate - Regenerate all secrets"
        echo "  validate   - Validate existing secrets"
        echo "  clean      - Remove all secrets"
        exit 1
        ;;
esac