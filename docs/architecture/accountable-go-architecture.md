# Accountable Go API Architecture

> **Status**: Architecture Design
> **Purpose**: Unified Go API for Accountable Product Suite
> **Architecture Pattern**: Modular Monolith
> **Tech Stack**: Go, PostgreSQL, gRPC (internal), REST (external)

## Executive Summary

This document defines the architecture for a **monolithic Go API** that hosts multiple Accountable products (Engage, Books, One, etc.) within a single codebase and deployment. The architecture emphasizes clean module boundaries, event-driven communication, and scalability while maintaining the operational simplicity of a monolith.

**Key Architectural Decisions**:

- **Modular Monolith** - One codebase, one binary, multiple product modules
- **Platform-First** - Shared services (users, companies, contacts) built before products
- **Event-Driven** - Modules communicate via internal event bus (in-memory)
- **Clean Architecture** - Handler → Service → Repository layers
- **PostgreSQL** - Single shared database with domain isolation

---

## Table of Contents

1. [Architectural Vision](#architectural-vision)
2. [Directory Structure](#directory-structure)
3. [Module Organization](#module-organization)
4. [Architecture Layers](#architecture-layers)
5. [Event-Driven Communication](#event-driven-communication)
6. [Database Strategy](#database-strategy)
7. [Migration from Node.js Books](#migration-from-nodejs-books)
8. [Design Patterns](#design-patterns)
9. [Implementation Phases](#implementation-phases)
10. [Decision Records](#decision-records)

---

## Architectural Vision

### What This Is

A **single Go application** containing multiple product modules:

- **Platform** - Shared services (users, companies, contacts, auth)
- **Engage** - CRM and engagement management for accounting firms
- **Books** - Accounting system (migrated from Node.js)
- **One** - Future product (placeholder)

### What This Is NOT

- **NOT microservices** - No separate deployments per product
- **NOT multi-repo** - Single codebase for all products
- **NOT shared database anti-pattern** - Proper domain boundaries and module isolation

### Why Modular Monolith?

**Benefits**:

1. **Simple Operations** - One binary, one database, one deployment
2. **Fast Communication** - Direct function calls between modules (no network)
3. **Atomic Transactions** - Can update multiple modules in single DB transaction
4. **Easy Refactoring** - Move code between modules without API versioning
5. **Team Efficiency** - Shared codebase, easier collaboration
6. **Future Flexibility** - Can extract to microservices later if needed

**Trade-offs**:

- Must maintain strict module boundaries (prevent tight coupling)
- Need discipline to avoid creating "big ball of mud"
- Single deployment means coordinated releases (not independent)

---

## Directory Structure

```
accountable-api-go/
├── cmd/
│   └── server/                  # Application entry point
│       └── main.go              # Server initialization
│
├── internal/                    # Private application code
│   ├── platform/                # Platform services (shared across products)
│   │   ├── users/               # User management, authentication
│   │   ├── companies/           # Organization management
│   │   ├── contacts/            # CRM contacts
│   │   ├── auth/                # Authentication, RBAC, JWT
│   │   ├── events/              # Internal event bus
│   │   └── files/               # File storage, S3 integration
│   │
│   ├── engage/                  # Accountable Engage product
│   │   ├── leads/               # Sales pipeline
│   │   ├── assessments/         # Fit assessment, scoring
│   │   ├── serviceorders/       # Proposals, contracts
│   │   ├── engagements/         # Service delivery
│   │   ├── workflows/           # Task management
│   │   └── pricing/             # Dynamic pricing engine
│   │
│   ├── books/                   # Accountable Books product (future)
│   │   ├── ledger/              # Double-entry accounting
│   │   ├── balances/            # Balance calculations, snapshots
│   │   ├── coa/                 # Chart of accounts
│   │   ├── reporting/           # Financial statements, fiscal calendar
│   │   ├── categorization/      # Transaction categorization
│   │   └── reconciliation/      # Bank reconciliation
│   │
│   └── shared/                  # Shared utilities (non-domain)
│       ├── middleware/          # HTTP middleware (auth, logging, etc.)
│       ├── validator/           # Request validation
│       └── pagination/          # Pagination helpers
│
├── pkg/                         # Public packages (can be imported externally)
│   ├── domain/                  # Shared domain entities
│   │   ├── user.go
│   │   ├── company.go
│   │   └── contact.go
│   ├── repository/              # Repository interfaces
│   │   └── repository.go
│   ├── errors/                  # Error definitions
│   │   └── errors.go
│   └── response/                # API response formats
│       └── response.go
│
├── api/                         # API definitions
│   ├── rest/                    # REST API routes (external)
│   │   └── router.go
│   └── grpc/                    # gRPC definitions (for future microservices, e.g python app)
│       └── protos/
│
├── migrations/                  # Database migrations
│   ├── 001_initial_schema.sql
│   └── 002_engage_tables.sql
│
├── config/                      # Configuration files
│   ├── config.go
│   └── development.yaml
│
└── scripts/                     # Build and deployment scripts
    ├── build.sh
    └── migrate.sh
```

### Directory Conventions

**`internal/`** - Private code, cannot be imported by external packages

- `platform/` - Core services shared across all products
- `engage/`, `books/`, etc. - Product-specific modules
- `shared/` - Non-domain utilities (middleware, helpers)

**`pkg/`** - Public packages, can be imported by external tools

- Shared entities, interfaces, errors

**`api/`** - API layer (HTTP, gRPC)

- External-facing endpoints

---

## Module Organization

### Module Structure Pattern

Every module (platform or product) follows the same structure:

```
internal/<product>/<domain>/
├── handler.go       # HTTP/gRPC handlers (API layer)
├── service.go       # Business logic (service layer)
├── repository.go    # Data access (repository layer)
├── models.go        # Domain models, request/response types
└── <domain>_test.go # Unit tests
```

**Example: Leads Module**

```go
// internal/engage/leads/handler.go
package leads

type Handler struct {
  service *Service
}

func (h *Handler) CreateLead(w http.ResponseWriter, r *http.Request) {
  var req CreateLeadRequest
  json.NewDecoder(r.Body).Decode(&req)

  lead, err := h.service.Create(r.Context(), req)
  if err != nil {
    response.Error(w, err)
    return
  }
  response.Success(w, lead)
}

// internal/engage/leads/service.go
package leads

type Service struct {
  repo          Repository
  companiesSvc  *companies.Service  // Platform dependency
  events        *events.Bus
}

func (s *Service) Create(ctx context.Context, req CreateLeadRequest) (*Lead, error) {
  lead := &Lead{
    FirmCompanyID: req.FirmCompanyID,
    ContactName:   req.ContactName,
    Status:        "new",
  }

  if err := s.repo.Save(ctx, lead); err != nil {
    return nil, err
  }

  s.events.Publish(events.Event{
    Type: "lead.created",
    Payload: LeadCreatedPayload{LeadID: lead.ID},
  })

  return lead, nil
}

// internal/engage/leads/repository.go
package leads

type Repository interface {
  Save(ctx context.Context, lead *Lead) error
  FindByID(ctx context.Context, id string) (*Lead, error)
  Update(ctx context.Context, lead *Lead) error
}

type PostgresRepository struct {
  db *sql.DB
}

func (r *PostgresRepository) Save(ctx context.Context, lead *Lead) error {
  query := `
    INSERT INTO leads (id, firm_company_id, contact_name, status, created_at)
    VALUES ($1, $2, $3, $4, $5)
  `
  _, err := r.db.ExecContext(ctx, query, lead.ID, lead.FirmCompanyID, lead.ContactName, lead.Status, time.Now())
  return err
}
```

### Module Dependencies

**Dependency Rules**:

1. `platform/` modules **CANNOT** import from product modules (`engage/`, `books/`)
2. Product modules **CAN** import from `platform/` modules
3. Product modules **CANNOT** import from each other (`engage/` cannot import `books/`)
4. All modules **CAN** import from `pkg/`

**Enforcement**:
Use `go mod` tools or linters to enforce dependency rules.

```
platform/  →  (no imports from products)
  ↑
  |
engage/   →  (imports from platform/)
books/    →  (imports from platform/)
  ↑
  |
pkg/      →  (no domain imports)
```

---

## Architecture Layers

### Layer 1: Handler (API Layer)

**Responsibility**: HTTP/gRPC request handling

**Duties**:

- Parse request parameters
- Validate request format (basic structure, required fields)
- Call service layer
- Format response (JSON, protobuf, etc.)
- Handle HTTP status codes

**Example**:

```go
func (h *LeadHandler) ConvertLead(w http.ResponseWriter, r *http.Request) {
  leadID := chi.URLParam(r, "leadID")

  err := h.service.ConvertToClient(r.Context(), leadID)
  if err != nil {
    response.Error(w, err)
    return
  }

  response.Success(w, map[string]string{"status": "converted"})
}
```

### Layer 2: Service (Business Logic Layer)

**Responsibility**: Business rules, validation, orchestration

**Duties**:

- Enforce business rules
- Validate domain logic (e.g., "can only convert qualified leads")
- Orchestrate multiple repository calls
- Publish events
- Manage transactions

**Example**:

```go
func (s *LeadService) ConvertToClient(ctx context.Context, leadID string) error {
  // Fetch lead
  lead, err := s.repo.FindByID(ctx, leadID)
  if err != nil {
    return errors.Wrap(err, "lead not found")
  }

  // Business rule: Only qualified leads can be converted
  if lead.Status != "qualified_for_discovery_offer" {
    return errors.New("lead must be qualified before conversion")
  }

  // Transaction: Create company + update lead
  return s.withTx(ctx, func(tx *sql.Tx) error {
    // Call platform service to create company
    company, err := s.companiesSvc.Create(ctx, companies.CreateRequest{
      LegalName: lead.CompanyName,
      Type:      "business",
    })
    if err != nil {
      return err
    }

    // Update lead status
    lead.Status = "active_client"
    lead.CompanyID = &company.ID
    if err := s.repo.Update(ctx, lead); err != nil {
      return err
    }

    // Publish event
    s.events.Publish(events.Event{
      Type: "lead.converted",
      Payload: LeadConvertedPayload{
        LeadID:    leadID,
        CompanyID: company.ID,
      },
    })

    return nil
  })
}
```

### Layer 3: Repository (Data Access Layer)

**Responsibility**: Database operations

**Duties**:

- Execute SQL queries
- Map database rows to domain entities
- Handle database-specific errors
- No business logic

**Example**:

```go
func (r *LeadRepository) Update(ctx context.Context, lead *Lead) error {
  query := `
    UPDATE leads
    SET status = $1, company_id = $2, updated_at = NOW()
    WHERE id = $3 AND is_deleted = false
  `
  result, err := r.db.ExecContext(ctx, query, lead.Status, lead.CompanyID, lead.ID)
  if err != nil {
    return errors.Wrap(err, "failed to update lead")
  }

  rows, _ := result.RowsAffected()
  if rows == 0 {
    return errors.New("lead not found or already deleted")
  }

  return nil
}
```

---

## Event-Driven Communication

### Internal Event Bus

**Purpose**: Decouple modules, enable cross-product communication without direct imports

**Pattern**: Publish-Subscribe (in-memory for monolith)

**Implementation**:

```go
// internal/platform/events/bus.go
package events

import "sync"

type Event struct {
  Type      string                 // e.g., "lead.converted"
  Payload   interface{}            // Event-specific data
  Metadata  map[string]string      // Tracing, user ID, etc.
  Timestamp time.Time
}

type Handler func(Event)

type Bus struct {
  handlers map[string][]Handler
  mu       sync.RWMutex
}

func NewBus() *Bus {
  return &Bus{
    handlers: make(map[string][]Handler),
  }
}

func (b *Bus) Publish(e Event) {
  e.Timestamp = time.Now()

  b.mu.RLock()
  handlers := b.handlers[e.Type]
  b.mu.RUnlock()

  for _, handler := range handlers {
    go handler(e)  // Async execution
  }
}

func (b *Bus) Subscribe(eventType string, handler Handler) {
  b.mu.Lock()
  defer b.mu.Unlock()

  b.handlers[eventType] = append(b.handlers[eventType], handler)
}
```

### Event Catalog

**Platform Events**:

- `company.created` - New company created
- `company.updated` - Company details changed
- `user.created` - New user registered
- `user.permissions_changed` - User role updated

**Engage Events**:

- `lead.created` - New lead added
- `lead.converted` - Lead became active client
- `assessment.completed` - Fit assessment finished
- `engagement.started` - Service delivery began

**Books Events** (future):

- `ledger.transaction_created` - New GL transaction
- `balance.recalculated` - Account balance updated
- `period.closed` - Fiscal period closed

### Event Usage Example

**Publisher** (Engage Leads Service):

```go
func (s *LeadService) ConvertToClient(ctx context.Context, leadID string) error {
  // ... business logic ...

  s.events.Publish(events.Event{
    Type: "lead.converted",
    Payload: LeadConvertedPayload{
      LeadID:      leadID,
      CompanyID:   companyID,
      FirmID:      firmID,
      ServiceType: "bookkeeping",
    },
  })

  return nil
}
```

**Subscriber** (Books Ledger Service):

```go
// Setup during application initialization
func (s *LedgerService) RegisterEventHandlers(bus *events.Bus) {
  bus.Subscribe("lead.converted", s.handleLeadConverted)
}

func (s *LedgerService) handleLeadConverted(e events.Event) {
  payload := e.Payload.(LeadConvertedPayload)

  // Automatically setup GL accounts if service type is bookkeeping
  if payload.ServiceType == "bookkeeping" {
    s.InitializeChartOfAccounts(context.Background(), payload.CompanyID)
  }
}
```

---

## Database Strategy

### Single Shared Database

**Approach**: One PostgreSQL database, domain-isolated tables

**Schema Organization**:

```sql
-- Platform tables
CREATE TABLE users (...);
CREATE TABLE companies (...);
CREATE TABLE contacts (...);

-- Engage tables
CREATE TABLE leads (...);
CREATE TABLE assessments (...);
CREATE TABLE service_orders (...);
CREATE TABLE engagements (...);

-- Books tables (future)
CREATE TABLE ledger_transactions (...);
CREATE TABLE gl_balances (...);
CREATE TABLE chart_of_accounts (...);
```

### Naming Conventions

**Tables**: `snake_case`, plural (e.g., `service_orders`)
**Columns**: `snake_case` (e.g., `created_at`, `firm_company_id`)
**Foreign Keys**: `{referenced_table}_id` (e.g., `company_id`, `user_id`)
**Enums**: `snake_case` types (e.g., `lead_status`, `service_type`)

### Standard Columns

All tables include:

```sql
id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
deleted_at TIMESTAMP WITH TIME ZONE NULL,
created_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL
```

### Soft Deletes

**Pattern**: Never hard delete, always use `is_deleted` flag

**Queries**: Always filter `WHERE is_deleted = false`

**Example**:

```sql
-- Soft delete
UPDATE leads SET is_deleted = true, deleted_at = NOW() WHERE id = $1;

-- Query (always filter soft-deleted records)
SELECT * FROM leads WHERE firm_company_id = $1 AND is_deleted = false;
```

### Migrations

**Tool**: `golang-migrate` or `goose`

**Convention**:

```
migrations/
├── 001_initial_platform_tables.up.sql
├── 001_initial_platform_tables.down.sql
├── 002_engage_tables.up.sql
├── 002_engage_tables.down.sql
```

**Run**: `make db-migrate` (via Makefile)

---

## Migration from Node.js Books

### Current State (Node.js)

- Accountable Books API in Node.js/Express
- 24 domain modules
- PostgreSQL database (same schema)
- BullMQ background jobs
- Knex for database queries

### Target State (Go)

- Accountable Books as a module in Go monolith
- Clean domain boundaries
- Shared platform services (users, companies, contacts)
- Event-driven communication
- Same PostgreSQL database (compatible schema)

### Migration Strategy

**Phase 1: Build Platform (Months 1-3)**

- Implement `platform/users`, `platform/companies`, `platform/contacts` in Go
- Deploy Go API with REST endpoints
- Keep Node.js API running (both serve traffic)

**Phase 2: Build Accountable Engage (Months 4-7)**

- Implement all Engage modules in Go
- Engage uses Platform services
- Node.js API untouched (serves Books customers)

**Phase 3: Books Migration Prep (Months 8-10)**

- Extract Books business logic from Node.js (into shared library if needed)
- Define Books service boundaries (ledger, balances, COA, etc.)
- Create Books Go module stubs

**Phase 4: Books Migration (Months 11-18)**

- Implement Books modules in Go (one at a time)
- Use same Platform services as Engage
- Gradual cutover: Feature flag routes some traffic to Go
- Monitor Go vs Node.js output parity
- Full cutover when confidence is high

### Module Mapping

| Books Domain (Node.js)    | Go Module              | Notes                                 |
| ------------------------- | ---------------------- | ------------------------------------- |
| `domains/companies`       | `platform/companies`   | Platform owns this, Books uses it     |
| `domains/users`           | `platform/users`       | Platform owns this, Books uses it     |
| `domains/contacts`        | `platform/contacts`    | Platform owns this, Books uses it     |
| `domains/ledgers`         | `books/ledger`         | New Books module                      |
| `domains/balances`        | `books/balances`       | New Books module, event-driven recalc |
| `domains/chartOfAccounts` | `books/coa`            | New Books module                      |
| `domains/reporting`       | `books/reporting`      | New Books module                      |
| `domains/categorization`  | `books/categorization` | New Books module                      |

**Decision Point: Banking**

- If banking is needed by multiple products → `platform/banking`
- If banking is Books-only → `books/banking`

---

## Design Patterns

### 1. Repository Pattern

**Interface**:

```go
type Repository interface {
  Save(ctx context.Context, entity Entity) error
  FindByID(ctx context.Context, id string) (Entity, error)
  FindAll(ctx context.Context, filters Filters) ([]Entity, error)
  Update(ctx context.Context, entity Entity) error
  Delete(ctx context.Context, id string) error  // Soft delete
}
```

**Benefits**:

- Testable (mock repository)
- Swappable storage (Postgres → CockroachDB)
- Abstraction from SQL details

### 2. Service Layer Pattern

**Structure**:

```go
type Service struct {
  repo        Repository
  dependencies []*OtherService  // Platform services
  events      *events.Bus
  logger      *log.Logger
}

func (s *Service) Create(ctx context.Context, req Request) (Entity, error) {
  // Validate
  // Business logic
  // Call repository
  // Publish event
}
```

**Benefits**:

- Centralized business logic
- Transaction management
- Event publishing
- Logging and metrics

### 3. Transaction Middleware

**Pattern**: Automatically wrap service calls in transactions

```go
func WithTransaction(db *sql.DB, handler func(*sql.Tx) error) error {
  tx, err := db.Begin()
  if err != nil {
    return err
  }
  defer tx.Rollback()

  if err := handler(tx); err != nil {
    return err
  }

  return tx.Commit()
}

// Usage
err := WithTransaction(db, func(tx *sql.Tx) error {
  // All operations use tx
  lead, _ := leadRepo.Save(tx, lead)
  company, _ := companyRepo.Save(tx, company)
  return nil
})
```

### 4. JSON Schema Validation

**Purpose**: Validate JSONB fields before saving

**Pattern**:

```go
import "github.com/xeipuuv/gojsonschema"

func (s *PricingService) Create(ctx context.Context, profile PricingProfile) error {
  // Get schema for service type
  schema := getSchemaForServiceType(profile.ServiceType)

  // Validate config_json
  result, err := gojsonschema.Validate(schema, profile.ConfigJSON)
  if err != nil || !result.Valid() {
    return errors.New("invalid pricing configuration")
  }

  // Save if valid
  return s.repo.Save(ctx, profile)
}
```

**Schema Files**:

```
schemas/
├── pricing_bookkeeping.json
├── pricing_tax.json
├── workflow_discovery.json
└── workflow_cleanup.json
```

---

## Implementation Phases

### Phase 1: Platform Foundation (Months 1-3)

**Goal**: Build core services needed by all products

**Modules to Build**:

1. `platform/users` - User management, authentication
2. `platform/companies` - Company CRUD, firm-client relationships
3. `platform/contacts` - CRM contacts
4. `platform/auth` - JWT authentication, RBAC
5. `platform/events` - Internal event bus

**Deliverables**:

- Working REST API for users, companies, contacts
- JWT authentication
- Event bus implementation
- Database migrations
- Unit tests (>80% coverage)

### Phase 2: Accountable Engage (Months 4-7)

**Goal**: Complete Engage product for production

**Modules to Build**:

1. `engage/leads` - Sales pipeline
2. `engage/assessments` - Fit assessment, scoring engine
3. `engage/serviceorders` - Proposals, contracts
4. `engage/engagements` - Service delivery
5. `engage/workflows` - Task management, dependencies
6. `engage/pricing` - Dynamic pricing calculator

**Deliverables**:

- Full CRM workflow (lead → client)
- Assessment scoring engine
- Pricing calculator
- Workflow engine
- Production deployment
- Monitoring and alerting

### Phase 3: Books Migration Prep (Months 8-10)

**Goal**: Prepare for Books migration

**Tasks**:

1. Analyze Books business logic
2. Define Books module boundaries
3. Create Books Go stubs
4. Setup feature flags for gradual rollout
5. Design event-driven balance recalculation

### Phase 4: Books Migration (Months 11-18)

**Goal**: Migrate Books from Node.js to Go

**Modules to Build**:

1. `books/ledger` - Double-entry accounting
2. `books/balances` - Balance calculations, snapshots
3. `books/coa` - Chart of accounts
4. `books/reporting` - Financial statements
5. `books/categorization` - Transaction categorization

**Strategy**:

- Migrate one module at a time
- Run Node.js and Go in parallel (feature flags)
- Compare outputs for parity
- Gradual traffic shift (10% → 50% → 100%)
- Keep Node.js running 1 month after 100% cutover (rollback safety)

---

## Decision Records

### ADR-001: Modular Monolith Architecture

**Decision**: Build as modular monolith, not microservices

**Rationale**:

- Simpler operations (one deployment, one database)
- Faster development (shared code, no API versioning)
- Team collaboration (cross-product work easier)
- Can extract to microservices later if needed

**Consequences**:

- Must enforce module boundaries
- Coordinated releases (not independent)
- Requires discipline to avoid coupling

### ADR-002: Event-Driven Communication

**Decision**: Modules communicate via in-memory event bus

**Rationale**:

- Loose coupling (Engage doesn't import Books)
- Easy to add new products
- Audit trail built-in
- Can switch to external bus (NATS, Kafka) later

**Consequences**:

- Eventual consistency (async events)
- Need error handling for failed event handlers
- Event schema versioning required

### ADR-003: Repository Pattern

**Decision**: Abstract data access behind repository interfaces

**Rationale**:

- Testable (mock repositories)
- Swappable storage (Postgres → other DB)
- Clean separation (business logic vs data access)

**Consequences**:

- More boilerplate code
- Need to define repository interfaces per domain

### ADR-004: Platform-First Development

**Decision**: Build Platform modules before product modules

**Rationale**:

- Platform services needed by all products
- Engage and Books both use same Platform
- Avoid duplication

**Consequences**:

- Platform must be stable before products build on it
- Platform changes impact all products

### ADR-005: PostgreSQL Only

**Decision**: Use PostgreSQL as single database

**Rationale**:

- Proven reliability
- Rich feature set (JSONB, enums, partitioning)
- Team expertise
- Compatible with existing Books schema

**Consequences**:

- Locked into PostgreSQL (no multi-DB flexibility)
- Must scale PostgreSQL vertically/horizontally

### ADR-006: gRPC Internal, REST External

**Decision**: Use gRPC for internal service communication (if split), REST for client APIs

**Rationale**:

- gRPC: Fast, type-safe, efficient for internal
- REST: Familiar, widely supported, easy for clients

**Consequences**:

- Need API gateway to translate REST → gRPC
- Protobuf schemas for gRPC

### ADR-007: JSON Schema Validation for JSONB

**Decision**: Validate all JSONB fields using JSON Schema

**Rationale**:

- Prevent invalid data in flexible JSONB columns
- Clear contract for what's allowed
- Better error messages

**Consequences**:

- Need to maintain schema files
- Validation adds processing time

---

## Success Metrics

**Architecture Quality**:

- Module dependency rules enforced (linter passes)
- Test coverage >80% for all modules
- No circular dependencies between modules

**Performance**:

- API response time <200ms (p95)
- Database queries optimized (no N+1)
- Event processing <100ms

**Reliability**:

- Uptime >99.9%
- Error rate <0.1%
- All errors logged and traceable

**Developer Experience**:

- New module can be added in <1 week
- Onboarding doc for new developers
- Clear examples for common patterns

---

## Next Steps

1. **Week 1-2**: Finalize architecture, review with team
2. **Week 3-4**: Setup project structure, tooling, CI/CD
3. **Month 2**: Build Platform modules (users, companies, contacts)
4. **Month 3**: Platform production-ready, start Engage development
5. **Month 6**: Engage production launch
6. **Month 12**: Books migration begins

---

**Document Version**: 1.0
**Last Updated**: 2025-12-08
**Authors**: Architecture Team
**Status**: Approved for Implementation
