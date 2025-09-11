#!/bin/bash

# Fly.io Staging Deployment Script for Accountable Books API
# This script handles deployment of the API to Fly.io staging environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="accountable-books-api-staging"
REGION="iad"
SECRETS_FILE="apps/api/.env.secrets.staging"
ENV_FILE="apps/api/.env.staging"
# Organization - can be overridden with FLY_ORG env var
FLY_ORG="${FLY_ORG:-accountable}"  # Default to 'accountable' organization

# Custom domain configuration
CUSTOM_DOMAIN="api-staging.getaccountable.com"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Fly CLI is installed
check_fly_cli() {
    if ! command -v fly &> /dev/null; then
        print_error "Fly CLI is not installed. Please install it first:"
        echo "  curl -L https://fly.io/install.sh | sh"
        exit 1
    fi
}

# Function to check if user is logged in to Fly
check_fly_auth() {
    if ! fly auth whoami &> /dev/null; then
        print_error "Not logged in to Fly.io. Please run:"
        echo "  fly auth login"
        exit 1
    fi
}

# Function to create the Fly app if it doesn't exist
create_app() {
    print_status "Checking if Fly app exists..."
    if ! fly apps list | grep -q "$APP_NAME"; then
        print_status "Creating Fly app: $APP_NAME in org: $FLY_ORG"
        
        # Try to create with specified org, fallback to no org flag if it fails
        if fly apps create "$APP_NAME" --org "$FLY_ORG" 2>/dev/null; then
            print_success "Created Fly app: $APP_NAME in org: $FLY_ORG"
        else
            print_warning "Could not create in org '$FLY_ORG', trying without org flag..."
            fly apps create "$APP_NAME" || {
                print_error "Failed to create app. You may need to:"
                echo "  1. Set FLY_ORG to your organization name: export FLY_ORG=your-org"
                echo "  2. Or create the app manually: fly apps create $APP_NAME"
                exit 1
            }
            print_success "Created Fly app: $APP_NAME"
        fi
    else
        print_success "Fly app already exists: $APP_NAME"
    fi
}

# Function to set secrets from .env.secrets.staging file
set_secrets() {
    if [ ! -f "$SECRETS_FILE" ]; then
        print_error "Secrets file not found: $SECRETS_FILE"
        print_status "Please ensure the secrets file exists and contains the required secrets"
        exit 1
    fi

    print_status "Setting secrets from $SECRETS_FILE..."
    
    # Use fly secrets import for bulk import (much faster)
    # This command reads the file directly and imports all secrets at once
    fly secrets import --app "$APP_NAME" < "$SECRETS_FILE" || {
        print_warning "Some secrets may have failed to set (possibly already exist)"
    }
    
    print_success "Secrets configured"
}

# Function to extract environment variables from fly.staging.toml
extract_fly_env_vars() {
    local fly_config="fly.staging.toml"
    local override_vars=()
    
    if [ ! -f "$fly_config" ]; then
        print_error "Fly config file not found: $fly_config"
        return 1
    fi
    
    print_status "Extracting environment variables from $fly_config..."
    
    # Extract variables from [env] section
    local in_env_section=false
    while IFS= read -r line; do
        # Check if we're entering the [env] section
        if [[ "$line" =~ ^\[env\]$ ]]; then
            in_env_section=true
            continue
        fi
        
        # Check if we're leaving the [env] section (next section starts)
        if [[ "$in_env_section" == true ]] && [[ "$line" =~ ^\[.*\]$ ]]; then
            break
        fi
        
        # Extract variable names from [env] section
        if [[ "$in_env_section" == true ]] && [[ "$line" =~ ^[[:space:]]*([A-Z_][A-Z0-9_]*)[[:space:]]*=[[:space:]]* ]]; then
            local var_name="${BASH_REMATCH[1]}"
            override_vars+=("$var_name")
            print_status "Found override var: $var_name"
        fi
    done < "$fly_config"
    
    echo "${override_vars[@]}"
}

# Function to build environment variables string for deployment
build_env_vars() {
    if [ ! -f "$ENV_FILE" ]; then
        print_error "Environment file not found: $ENV_FILE"
        print_status "Please ensure the environment file exists"
        exit 1
    fi

    print_status "Building environment variables from $ENV_FILE..."
    
    # Build env vars string for fly deploy
    ENV_ARGS=""
    
    # Dynamically extract override variables from fly.staging.toml
    local override_vars=($(extract_fly_env_vars))
    
    if [ ${#override_vars[@]} -eq 0 ]; then
        print_warning "No environment variables found in fly.staging.toml [env] section"
    else
        print_status "Found ${#override_vars[@]} variables in fly.staging.toml that will override local values"
    fi
    
    # Read env file and build non-secret variables
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ $key =~ ^#.*$ ]] && continue
        [[ -z $key ]] && continue
        
        # Skip secrets (these should be in .env.secrets.staging)
        if [[ $key == *"SECRET"* ]] || [[ $key == *"PASSWORD"* ]] || [[ $key == *"KEY"* ]]; then
            continue
        fi
        
        # Skip variables that are overridden by fly.staging.toml
        if [[ " ${override_vars[@]} " =~ " ${key} " ]]; then
            print_status "Skipping $key (overridden by fly.staging.toml)"
            continue
        fi
        
        # Remove quotes from value if present
        value=$(echo "$value" | sed 's/^"//;s/"$//;s/^'"'"'//;s/'"'"'$//')
        
        print_status "Adding env var: $key"
        ENV_ARGS="$ENV_ARGS --env $key=\"$value\""
    done < "$ENV_FILE"
    
    print_success "Environment variables prepared"
}

# Function to validate Fly.io secrets
validate_secrets() {
    print_status "Validating Fly.io secrets..."
    
    # Change to the API directory and run validation
    cd apps/api || {
        print_error "Failed to change to apps/api directory"
        exit 1
    }
    
    if pnpm fly:secrets:validate 2>/dev/null; then
        print_success "All required secrets are configured"
    else
        print_error "Missing required secrets detected!"
        print_status "Run the validation manually to see what's missing:"
        echo "  cd apps/api && pnpm fly:secrets:validate"
        exit 1
    fi
    
    # Return to root directory
    cd ../.. || exit 1
}

# Function to deploy the application
deploy_app() {
    print_status "Deploying application to Fly.io..."
    
    # Build env vars first
    build_env_vars
    
    # Deploy with the staging configuration and env vars
    eval "fly deploy --app \"$APP_NAME\" --config \"fly.staging.toml\" $ENV_ARGS"
    
    print_success "Deployment completed successfully!"
}

# Function to show deployment status
show_status() {
    print_status "Checking deployment status..."
    fly status --app "$APP_NAME"
}

# Function to show logs
show_logs() {
    print_status "Showing recent logs..."
    fly logs --app "$APP_NAME"
}

# Function to scale the application
scale_app() {
    local count=${1:-1}
    print_status "Scaling application to $count instances..."
    fly scale count "$count" --app "$APP_NAME"
}

# Function to configure custom domain
configure_domain() {
    print_status "Configuring custom domain: $CUSTOM_DOMAIN"
    
    # Check if domain is already configured
    if fly ips list --app "$APP_NAME" | grep -q "$CUSTOM_DOMAIN"; then
        print_success "Custom domain already configured: $CUSTOM_DOMAIN"
        return
    fi
    
    # Add the custom domain
    fly certs add "$CUSTOM_DOMAIN" --app "$APP_NAME" || {
        print_warning "Failed to add SSL certificate for $CUSTOM_DOMAIN"
        print_status "You may need to configure DNS manually:"
        echo "  Add CNAME record: $CUSTOM_DOMAIN -> $APP_NAME.fly.dev"
        echo "  Then run: fly certs add $CUSTOM_DOMAIN --app $APP_NAME"
    }
    
    print_success "Custom domain configured: $CUSTOM_DOMAIN"
}

# Function to destroy the application (for cleanup)
destroy_app() {
    print_warning "This will completely destroy the Fly app: $APP_NAME"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Destroying Fly app: $APP_NAME"
        fly apps destroy "$APP_NAME" --yes
        print_success "Fly app destroyed"
    else
        print_status "Destroy cancelled"
    fi
}

# Main deployment function
deploy() {
    print_status "Starting Fly.io staging deployment..."
    print_status "Using organization: $FLY_ORG (override with: export FLY_ORG=your-org)"
    
    check_fly_cli
    check_fly_auth
    create_app
    set_secrets
    validate_secrets
    deploy_app  # This now handles env vars internally
    configure_domain
    show_status
    
    print_success "Deployment completed! Your API should be available at:"
    echo "  https://$APP_NAME.fly.dev"
    echo "  https://$CUSTOM_DOMAIN (after DNS configuration)"
}

# Main script logic
case "${1:-deploy}" in
    "deploy")
        deploy
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "scale")
        scale_app "$2"
        ;;
    "destroy")
        destroy_app
        ;;
    "secrets")
        check_fly_cli
        check_fly_auth
        set_secrets
        ;;
    "create")
        create_app
        ;;
    "domain")
        configure_domain
        ;;
    "validate")
        check_fly_cli
        check_fly_auth
        validate_secrets
        ;;
    *)
        echo "Usage: $0 {deploy|status|logs|scale|destroy|secrets|create|domain|validate}"
        echo ""
        echo "Commands:"
        echo "  deploy    - Full deployment (default)"
        echo "  status    - Show deployment status"
        echo "  logs      - Show application logs"
        echo "  scale N   - Scale to N instances"
        echo "  destroy   - Destroy the Fly app"
        echo "  secrets   - Set secrets only"
        echo "  create    - Create Fly app only"
        echo "  domain    - Configure custom domain"
        echo "  validate  - Validate Fly.io secrets only"
        echo ""
        echo "Environment:"
        echo "  FLY_ORG  - Fly.io organization (default: accountable)"
        exit 1
        ;;
esac
