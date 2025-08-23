#!/bin/bash

# =============================================================================
# Backup and Restore Script for Staging Environment
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./backups"
COMPOSE_FILE="docker-compose.staging.prod.yml"
DB_SERVICE="db"
DB_USER="app_user"
DB_NAME="accountable_books"
REDIS_SERVICE="redis"

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

# Setup backup directory
setup_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        log_success "Created backup directory: $BACKUP_DIR"
    fi
    
    # Set proper permissions
    chmod 755 "$BACKUP_DIR"
}

# Backup database
backup_database() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/postgres_backup_${timestamp}.sql"
    
    log_info "Backing up PostgreSQL database..."
    
    # Check if database service is running
    if ! docker compose -f "$COMPOSE_FILE" ps "$DB_SERVICE" | grep -q "Up"; then
        log_error "Database service is not running"
        return 1
    fi
    
    # Create backup
    docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
        pg_dump -U "$DB_USER" -d "$DB_NAME" --no-password \
        --verbose --clean --if-exists --create > "$backup_file"
    
    if [ $? -eq 0 ]; then
        log_success "Database backup created: $backup_file"
        
        # Compress backup
        gzip "$backup_file"
        log_success "Backup compressed: ${backup_file}.gz"
        
        # Set permissions
        chmod 600 "${backup_file}.gz"
        
        echo "$backup_file.gz"
    else
        log_error "Database backup failed"
        return 1
    fi
}

# Backup Redis data
backup_redis() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/redis_backup_${timestamp}.rdb"
    
    log_info "Backing up Redis data..."
    
    # Check if Redis service is running
    if ! docker compose -f "$COMPOSE_FILE" ps "$REDIS_SERVICE" | grep -q "Up"; then
        log_error "Redis service is not running"
        return 1
    fi
    
    # Trigger Redis save
    docker compose -f "$COMPOSE_FILE" exec -T "$REDIS_SERVICE" redis-cli BGSAVE
    
    # Wait for save to complete
    sleep 5
    
    # Copy dump file
    docker compose -f "$COMPOSE_FILE" exec -T "$REDIS_SERVICE" \
        cat /data/dump.rdb > "$backup_file"
    
    if [ $? -eq 0 ]; then
        log_success "Redis backup created: $backup_file"
        
        # Compress backup
        gzip "$backup_file"
        log_success "Redis backup compressed: ${backup_file}.gz"
        
        # Set permissions
        chmod 600 "${backup_file}.gz"
        
        echo "$backup_file.gz"
    else
        log_error "Redis backup failed"
        return 1
    fi
}

# Backup application logs
backup_logs() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/logs_backup_${timestamp}.tar.gz"
    
    log_info "Backing up application logs..."
    
    # Create logs archive
    tar -czf "$backup_file" \
        --exclude="*.tmp" \
        --exclude="*.lock" \
        logs/ 2>/dev/null || true
    
    if [ -f "$backup_file" ]; then
        log_success "Logs backup created: $backup_file"
        chmod 600 "$backup_file"
        echo "$backup_file"
    else
        log_warning "No logs found to backup"
    fi
}

# Backup configuration files
backup_config() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/config_backup_${timestamp}.tar.gz"
    
    log_info "Backing up configuration files..."
    
    # Create config archive
    tar -czf "$backup_file" \
        docker-compose*.yml \
        .env.* \
        infra/ \
        scripts/ \
        apps/*/nginx/ \
        2>/dev/null || true
    
    if [ -f "$backup_file" ]; then
        log_success "Configuration backup created: $backup_file"
        chmod 600 "$backup_file"
        echo "$backup_file"
    else
        log_error "Configuration backup failed"
        return 1
    fi
}

# Full backup
full_backup() {
    log_info "Starting full backup..."
    
    setup_backup_dir
    
    local backup_manifest="$BACKUP_DIR/backup_manifest_$(date +%Y%m%d_%H%M%S).txt"
    
    echo "# Backup Manifest" > "$backup_manifest"
    echo "# Created: $(date)" >> "$backup_manifest"
    echo "# Environment: Staging" >> "$backup_manifest"
    echo "" >> "$backup_manifest"
    
    # Backup database
    if db_backup=$(backup_database); then
        echo "database=$db_backup" >> "$backup_manifest"
    fi
    
    # Backup Redis
    if redis_backup=$(backup_redis); then
        echo "redis=$redis_backup" >> "$backup_manifest"
    fi
    
    # Backup logs
    if logs_backup=$(backup_logs); then
        echo "logs=$logs_backup" >> "$backup_manifest"
    fi
    
    # Backup configuration
    if config_backup=$(backup_config); then
        echo "config=$config_backup" >> "$backup_manifest"
    fi
    
    log_success "Full backup completed! Manifest: $backup_manifest"
}

# Restore database
restore_database() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    log_warning "This will REPLACE the current database. Are you sure?"
    read -p "Type 'YES' to continue: " -r
    if [ "$REPLY" != "YES" ]; then
        log_info "Database restore cancelled"
        return 0
    fi
    
    log_info "Restoring database from: $backup_file"
    
    # Decompress if needed
    local restore_file="$backup_file"
    if [[ "$backup_file" == *.gz ]]; then
        restore_file="${backup_file%.gz}"
        gunzip -c "$backup_file" > "$restore_file"
    fi
    
    # Restore database
    docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
        psql -U "$DB_USER" -d postgres < "$restore_file"
    
    if [ $? -eq 0 ]; then
        log_success "Database restored successfully"
        
        # Clean up temporary file
        if [[ "$backup_file" == *.gz ]]; then
            rm -f "$restore_file"
        fi
    else
        log_error "Database restore failed"
        return 1
    fi
}

# Restore Redis
restore_redis() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    log_warning "This will REPLACE the current Redis data. Are you sure?"
    read -p "Type 'YES' to continue: " -r
    if [ "$REPLY" != "YES" ]; then
        log_info "Redis restore cancelled"
        return 0
    fi
    
    log_info "Restoring Redis from: $backup_file"
    
    # Stop Redis service
    docker compose -f "$COMPOSE_FILE" stop "$REDIS_SERVICE"
    
    # Decompress if needed
    local restore_file="$backup_file"
    if [[ "$backup_file" == *.gz ]]; then
        restore_file="${backup_file%.gz}"
        gunzip -c "$backup_file" > "$restore_file"
    fi
    
    # Copy backup to Redis volume
    docker run --rm -v "$(pwd):/backup" -v "accountable-books_redis_data:/data" \
        alpine sh -c "cp /backup/$restore_file /data/dump.rdb && chmod 644 /data/dump.rdb"
    
    # Start Redis service
    docker compose -f "$COMPOSE_FILE" start "$REDIS_SERVICE"
    
    if [ $? -eq 0 ]; then
        log_success "Redis restored successfully"
        
        # Clean up temporary file
        if [[ "$backup_file" == *.gz ]]; then
            rm -f "$restore_file"
        fi
    else
        log_error "Redis restore failed"
        return 1
    fi
}

# List backups
list_backups() {
    log_info "Available backups:"
    
    if [ ! -d "$BACKUP_DIR" ]; then
        log_warning "No backup directory found"
        return 0
    fi
    
    echo
    echo "📁 Backup Directory: $BACKUP_DIR"
    echo
    
    # List backup files
    find "$BACKUP_DIR" -name "*.gz" -o -name "*.sql" -o -name "*.rdb" -o -name "*.tar.gz" | \
    sort -r | while read -r file; do
        local size=$(du -h "$file" | cut -f1)
        local date=$(stat -c %y "$file" 2>/dev/null || stat -f %Sm "$file")
        echo "  📄 $(basename "$file") ($size) - $date"
    done
    
    echo
    
    # List manifests
    find "$BACKUP_DIR" -name "*manifest*.txt" | sort -r | while read -r manifest; do
        echo "📋 Manifest: $(basename "$manifest")"
        cat "$manifest" | grep -E "^(database|redis|logs|config)=" | sed 's/^/  /'
        echo
    done
}

# Cleanup old backups
cleanup_backups() {
    local days=${1:-7}
    
    log_info "Cleaning up backups older than $days days..."
    
    if [ ! -d "$BACKUP_DIR" ]; then
        log_warning "No backup directory found"
        return 0
    fi
    
    local deleted_count=0
    
    # Find and delete old files
    find "$BACKUP_DIR" -type f \( -name "*.gz" -o -name "*.sql" -o -name "*.rdb" -o -name "*.tar.gz" -o -name "*.txt" \) \
        -mtime +"$days" -print0 | while IFS= read -r -d '' file; do
        log_info "Deleting old backup: $(basename "$file")"
        rm -f "$file"
        ((deleted_count++))
    done
    
    log_success "Cleanup completed. Deleted $deleted_count old backup files"
}

# Health check
health_check() {
    log_info "Checking backup system health..."
    
    # Check backup directory
    if [ -d "$BACKUP_DIR" ]; then
        log_success "Backup directory exists"
    else
        log_warning "Backup directory missing"
    fi
    
    # Check disk space
    local available_space=$(df -h "$BACKUP_DIR" 2>/dev/null | awk 'NR==2 {print $4}' || echo "unknown")
    log_info "Available disk space: $available_space"
    
    # Check services
    if docker compose -f "$COMPOSE_FILE" ps "$DB_SERVICE" | grep -q "Up"; then
        log_success "Database service is running"
    else
        log_warning "Database service is not running"
    fi
    
    if docker compose -f "$COMPOSE_FILE" ps "$REDIS_SERVICE" | grep -q "Up"; then
        log_success "Redis service is running"
    else
        log_warning "Redis service is not running"
    fi
    
    # Check recent backups
    local recent_backups=$(find "$BACKUP_DIR" -name "*.gz" -mtime -1 2>/dev/null | wc -l)
    log_info "Recent backups (last 24h): $recent_backups"
}

# Main function
main() {
    case "${1:-help}" in
        "backup")
            full_backup
            ;;
        "backup-db")
            setup_backup_dir
            backup_database
            ;;
        "backup-redis")
            setup_backup_dir
            backup_redis
            ;;
        "backup-logs")
            setup_backup_dir
            backup_logs
            ;;
        "backup-config")
            setup_backup_dir
            backup_config
            ;;
        "restore-db")
            if [ -z "${2:-}" ]; then
                log_error "Please specify backup file"
                echo "Usage: $0 restore-db <backup_file>"
                exit 1
            fi
            restore_database "$2"
            ;;
        "restore-redis")
            if [ -z "${2:-}" ]; then
                log_error "Please specify backup file"
                echo "Usage: $0 restore-redis <backup_file>"
                exit 1
            fi
            restore_redis "$2"
            ;;
        "list")
            list_backups
            ;;
        "cleanup")
            cleanup_backups "${2:-7}"
            ;;
        "health")
            health_check
            ;;
        "help"|*)
            echo "Usage: $0 {backup|backup-db|backup-redis|backup-logs|backup-config|restore-db|restore-redis|list|cleanup|health}"
            echo
            echo "Backup Commands:"
            echo "  backup        - Full system backup"
            echo "  backup-db     - Backup database only"
            echo "  backup-redis  - Backup Redis only"
            echo "  backup-logs   - Backup logs only"
            echo "  backup-config - Backup configuration only"
            echo
            echo "Restore Commands:"
            echo "  restore-db <file>    - Restore database from backup"
            echo "  restore-redis <file> - Restore Redis from backup"
            echo
            echo "Management Commands:"
            echo "  list          - List available backups"
            echo "  cleanup [days] - Delete backups older than N days (default: 7)"
            echo "  health        - Check backup system health"
            echo
            exit 1
            ;;
    esac
}

main "$@"