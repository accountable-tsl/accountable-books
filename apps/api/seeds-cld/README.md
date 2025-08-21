# Demo Seeding System - Enhanced Implementation

This directory contains the enhanced demo seeding system for Accountable Books, providing comprehensive, organized, and manageable demo data across multiple countries and company types.

## 🎯 Overview

**Goal**: Create 6 demo companies (3 USA, 3 Nigeria) with one company for each type (individual, business, accounting_firm) per country, with rich, realistic data and easy management.

**Key Features**:

- ✅ **Idempotent**: Seeds can be safely re-run without duplicating data
- ✅ **Trackable**: Full audit trail of what was created when and by which seed
- ✅ **Reversible**: Clean removal of demo data with proper dependency handling
- ✅ **Country-aware**: US vs Nigeria specific data (currencies, banks, regulations)
- ✅ **Scenario-driven**: Company type determines realistic data patterns
- ✅ **CLI-managed**: Simple commands for complex operations

## 📁 Directory Structure

```
seeds-cld/
├── README.md                    # This documentation
├── cli.ts                       # Main CLI interface
├── steps/                       # Step-based seed definitions
│   ├── index.ts                # Step registry
│   ├── companies.ts            # Companies & users step
│   ├── bank-accounts.ts        # Bank accounts step
│   ├── contacts.ts             # Contacts step
│   ├── projects.ts             # Projects step
│   ├── transactions.ts         # Bank transactions step
│   └── journals.ts             # Journal entries step
├── data/                       # Data generation & configuration
│   ├── countries/              # Country-specific data
│   │   ├── index.ts           # Country registry
│   │   ├── us.ts              # US-specific configuration
│   │   └── ng.ts              # Nigeria-specific configuration
│   ├── companies/              # Company type configurations
│   │   ├── index.ts           # Company type registry
│   │   ├── individual.ts      # Individual company scenarios
│   │   ├── business.ts        # Business company scenarios
│   │   └── accounting-firm.ts # Firm company scenarios
│   └── config.ts              # Master configuration
└── utils/                      # Enhanced utilities
    ├── step-runner.ts          # Step-based seed execution engine
    ├── command-parser.ts       # Enhanced CLI command parsing
    ├── progress-reporter.ts    # Progress reporting & logging
    └── types.ts                # Shared type definitions
```

## 🏢 Demo Companies Configuration

### United States (USD Currency)

- **us-individual**: "John Smith's Finances" - Personal finance management
- **us-business**: "Smith Tech Solutions LLC" - Technology startup
- **us-firm**: "US Demo Accounting Firm" - Professional services firm

### Nigeria (NGN Currency)

- **ng-individual**: "Adebayo's Personal Finance" - Individual financial management
- **ng-business**: "Lagos Digital Solutions Ltd" - Technology company
- **ng-firm**: "Nigeria Demo Accounting Firm" - Professional accounting firm

## 🚀 CLI Commands

### Setup Operations

```bash
# Setup all 6 demo companies
pnpm seed:demo:all

# Setup by country (3 companies)
pnpm seed:demo:country us
pnpm seed:demo:country ng

# Setup by company type (2 companies)
pnpm seed:demo:type individual
pnpm seed:demo:type business
pnpm seed:demo:type accounting_firm

# Setup specific company
pnpm seed:demo:company us-individual
pnpm seed:demo:company ng-business
```

### Data Enhancement

```bash
# Add more data to existing companies
pnpm seed:demo:add transactions --company us-business --count 100
pnpm seed:demo:add contacts --type business --country ng
pnpm seed:demo:add journals --company ng-firm --months 6
```

### Management & Inspection

```bash
# View seeding status
pnpm seed:demo:status

# List all demo companies and their data
pnpm seed:demo:list

# Inspect specific company details
pnpm seed:demo:inspect us-individual

# Show seed execution history
pnpm seed:demo:history
```

### Cleanup Operations

```bash
# Clean all demo data
pnpm seed:demo:clean all

# Clean by filters
pnpm seed:demo:clean --country us
pnpm seed:demo:clean --type individual
pnpm seed:demo:clean --company ng-business

# Dry run (show what would be deleted)
pnpm seed:demo:clean --dry-run all
```

## 🔧 Technical Implementation

### Enhanced Seed Registry

- **Strongly typed**: TypeScript interfaces ensure type safety
- **Dependency tracking**: Seeds declare their dependencies for proper execution order
- **Version detection**: Automatic versioning based on configuration changes
- **Parallel execution**: Independent seeds run in parallel for speed

### Idempotency & Tracking

- **Content-based checksums**: Detect when seed data has changed
- **Granular tracking**: Track individual entities, not just table operations
- **Conflict resolution**: Smart handling of data conflicts and updates
- **Rollback support**: Complete reversal with dependency-aware cleanup

### Rich Data Generation

- **Country-specific**: Proper currencies, bank formats, regulatory compliance
- **Realistic scenarios**: Transaction patterns matching company types
- **Relationship-aware**: Proper foreign key relationships and data integrity
- **Configurable volume**: Adjustable data quantities per scenario

## 📊 Data Scenarios

### Individual Companies

- **Bank Accounts**: Checking, savings with realistic balances
- **Transactions**: Personal expenses, income, subscriptions
- **Contacts**: Family, service providers, subscription services
- **Categories**: Personal finance categories

### Business Companies

- **Bank Accounts**: Business checking, credit lines, merchant accounts
- **Transactions**: B2B payments, payroll, expenses, revenue
- **Contacts**: Suppliers, customers, service providers
- **Projects**: Development projects, marketing campaigns
- **Categories**: Business expense and revenue categories

### Accounting Firm Companies

- **Bank Accounts**: Operating accounts, client trust accounts
- **Transactions**: Client payments, professional expenses, software subscriptions
- **Contacts**: Clients, software vendors, professional services
- **Projects**: Client engagements, tax seasons, audits
- **Categories**: Professional services categories

## 🛠️ Implementation Progress

- [x] **Phase 1**: Architecture design and planning
- [x] **Phase 2**: Directory structure and documentation
- [x] **Phase 3**: Core CLI and command parsing
- [x] **Phase 4**: Enhanced seed registry system
- [x] **Phase 5**: Country and company-type data generators
- [ ] **Phase 6**: Rich demo data scenarios (Seed Definitions - IN PROGRESS)
- [ ] **Phase 7**: Testing and integration

## ✅ Currently Working

The following components are implemented and functional:

### CLI Interface

- ✅ **Command Parser**: Full argument parsing with validation
- ✅ **Progress Reporting**: Visual progress bars and status updates
- ✅ **Error Handling**: Comprehensive error reporting with stack traces

### Configuration System

- ✅ **Country Configurations**: US and Nigeria with realistic data
- ✅ **Company Type Configurations**: Individual, Business, Accounting Firm
- ✅ **Demo Company Definitions**: All 6 companies fully configured

### Data Generators

- ✅ **Bank Account Generators**: Country-specific formats and amounts
- ✅ **Transaction Generators**: Realistic patterns by company type
- ✅ **Contact Generators**: Country and business-appropriate contacts
- ✅ **Project Generators**: Company-type specific project scenarios

### Seed Registry

- ✅ **Enhanced Tracking**: Granular artifact tracking with checksums
- ✅ **Idempotency**: Safe re-running with change detection
- ✅ **Dependency Management**: Automatic dependency resolution
- ✅ **Parallel Execution**: Performance optimization for independent seeds

## 🚧 Still To Implement

### Seed Definitions (Phase 6)

- [ ] Companies Seed: Create user accounts and company records
- [ ] Bank Accounts Seed: Setup bank accounts with realistic data
- [ ] Transactions Seed: Generate transaction history
- [ ] Contacts Seed: Create contact networks
- [ ] Projects Seed: Setup project structures
- [ ] Journal Entries Seed: Create accounting entries

## 🔍 Migration from Old System

### What Changed

- **Organization**: Clear separation of concerns vs mixed responsibilities
- **Scope**: 6 companies vs 3 hardcoded companies
- **Management**: CLI commands vs manual script execution
- **Data quality**: Rich scenarios vs basic generated data
- **Tracking**: Granular entity tracking vs table-level tracking

### Backward Compatibility

- The old `seeds/demo/` system remains functional
- New system uses separate `seed_runs` entries with `cld:` prefix
- No conflicts between old and new systems
- Migration path provided for existing demo data

## 📝 Usage Examples

### Quick Start - Setup Everything

```bash
# One command to rule them all
pnpm seed:demo:all
```

### Targeted Development

```bash
# Working on individual finance features
pnpm seed:demo:type individual

# Need Nigerian business data
pnpm seed:demo:company ng-business

# Add more transaction data for testing
pnpm seed:demo:add transactions --company ng-business --count 500
```

### Demo Environment Management

```bash
# Reset demo environment
pnpm seed:demo:clean all
pnpm seed:demo:all

# Show status for stakeholder demo
pnpm seed:demo:status
```

## 🔥 Enhanced Step-Based Architecture (v2.0)

The seeding system has been enhanced with a step-based architecture that combines the best aspects of surgical precision and rich data modeling.

### New Features

- **Step-Based Execution**: Individual steps can be applied independently
- **Surgical Targeting**: Add specific steps to filtered companies
- **Rich Tagging**: Enhanced filtering and discovery
- **Generic Purge System**: Artifact-driven cleanup for any filters
- **Enhanced CLI**: More intuitive commands with better targeting

### New Commands

#### Apply Steps (Replaces setup)

```bash
# Apply all steps to all companies
tsx seeds-cld/cli.ts apply --all

# Apply all steps to US companies only
tsx seeds-cld/cli.ts apply --country us

# Apply specific steps to all companies
tsx seeds-cld/cli.ts apply --steps companies,bank-accounts,contacts

# Apply all steps to business companies in Nigeria
tsx seeds-cld/cli.ts apply --country ng --type business
```

#### Add Individual Steps

```bash
# Add transactions to specific company
tsx seeds-cld/cli.ts add --step transactions --company us-business

# Add contacts to all business companies
tsx seeds-cld/cli.ts add --step contacts --type business

# Add bank accounts to Nigerian companies
tsx seeds-cld/cli.ts add --step bank-accounts --country ng
```

#### Surgical Purge Operations

```bash
# Purge all demo data
tsx seeds-cld/cli.ts purge --all --force

# Purge just transactions from US companies
tsx seeds-cld/cli.ts purge --step transactions --country us --force

# Purge all data for specific company
tsx seeds-cld/cli.ts purge --company ng-business --force

# Purge all business company data
tsx seeds-cld/cli.ts purge --type business --force
```

#### Enhanced Listing

```bash
# List companies and available steps
tsx seeds-cld/cli.ts list

# Show execution history
tsx seeds-cld/cli.ts history
```

### Step Dependencies

Steps are executed in dependency order:

1. **companies** (no dependencies)
2. **bank-accounts** → companies
3. **contacts** → companies
4. **projects** → companies, contacts
5. **transactions** → companies, bank-accounts, contacts
6. **journals** → companies, bank-accounts, contacts, transactions

### Migration from v1.0

Legacy commands still work:

- `setup all` → `apply --all`
- `clean all` → `purge --all --force`

---

**Last Updated**: 2025-08-20  
**Version**: 2.0.0 - Step-Based Architecture  
**Author**: Claude Code Assistant
