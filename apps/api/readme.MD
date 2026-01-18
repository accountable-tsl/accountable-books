# Accountable Books API

Node.js/Express/TypeScript backend for the Accountable Books platform.

## 🚀 Quick Start

From the root directory:

```bash
make setup      # One-time setup (installs deps, starts DB, runs migrations)
make api-dev    # Start API development server
```

API will be available at: **http://localhost:5000**

### Direct Development

```bash
cd apps/api
pnpm dev        # Start development server
pnpm test       # Run tests
pnpm build      # Build for production
```

## 🏗️ Architecture

- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Knex.js ORM
- **Cache**: Redis for sessions and queues
- **Queue**: BullMQ for background jobs
- **Validation**: Zod schemas
- **Testing**: Vitest + Supertest
- **Documentation**: OpenAPI/Swagger

## 📁 Project Structure

```
src/
├── app.ts                 # Express app setup
├── server.ts             # Server entry point
├── config/               # Configuration and environment
├── core/                 # Core types, middleware, validation
├── domains/              # Domain-specific modules (users, companies, etc.)
├── features/             # Feature modules (auth, onboarding, etc.)
├── shared/               # Shared utilities and constants
├── docs/                 # API documentation
├── jobs/                 # Background job definitions
└── lib/                  # External service clients
```

### Domain-Driven Structure

Each domain follows a consistent structure:

```
domains/users/
├── users.model.ts        # Database models and queries
├── users.controller.ts   # HTTP request handlers
├── users.routes.ts       # Route definitions
├── users.types.ts        # TypeScript types
└── users.utils.ts        # Domain-specific utilities
```

## 🗄️ Database

### Local Development Database

- **Host**: localhost:5433 (Docker)
- **Database**: `accountable_books`
- **User/Pass**: `user`/`password`

### Common Operations

```bash
# From root directory
make db-up        # Start database services
make db-migrate   # Run migrations
make db-rollback  # Rollback last migration
make db-seed      # Seed with demo data
make db-shell     # Connect to database shell
make db-logs      # View database logs
```

### Migrations

Migrations are located in `/migrations/` and use Knex.js:

```bash
# Create new migration
pnpm migrate:make migration_name

# Run pending migrations
pnpm migrate:local

# Rollback last batch
pnpm migrate:rollback
```

## 🔧 Environment Configuration

Environment variables are loaded from `apps/api/.env.local` (created automatically by `make setup`).

Key variables for local development:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_ACCESS_SECRET` - JWT signing secret
- `PORT` - API server port (default: 5000)

See [Environment Variables Guide](../../docs/ENVIRONMENT.md) for complete configuration details.

## 🧪 Testing

### Running Tests

```bash
pnpm test              # Run all tests
pnpm test:watch        # Run tests in watch mode
pnpm test:coverage     # Run with coverage report
```

### Test Structure

- **Unit tests**: Test individual functions/classes
- **Integration tests**: Test API endpoints with real database
- **Utilities**: `tests/testUtils.ts` provides test database helpers

### Writing Tests

```typescript
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, testDb } from '../tests/testUtils.js';

describe('User API', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should create a user', async () => {
    const response = await request(app)
      .post('/users')
      .send({ email: 'test@example.com' });

    expect(response.status).toBe(201);
  });
});
```

## 🔄 Background Jobs

The API uses BullMQ for background job processing:

### Available Queues

- **Email Queue**: Sending emails via Postmark
- **Analytics Queue**: Tracking events to Mixpanel

### Development

- **Bull Board**: http://localhost:5000/admin/queues (admin/secret)
- **Redis Commander**: Connect to localhost:6380

### Creating Jobs

```typescript
import { emailQueue } from '../jobs/queues/email.queue.js';

await emailQueue.add('welcome-email', {
  to: 'user@example.com',
  template: 'welcome',
  data: { name: 'John' },
});
```

## 📖 API Documentation

### Interactive Documentation

- **Swagger UI**: http://localhost:5000/docs (when running)
- **OpenAPI Spec**: `http://localhost:5000/docs/json`

### API Development

API endpoints are implemented with:

1. **TypeScript types** defined locally in domain files
2. **Zod schemas** for runtime validation
3. **API documentation** via Swagger (code-first approach)

### Adding New Endpoints

1. **Define types** in the appropriate domain file (e.g., `src/domains/users/users.types.ts`)
2. **Create Zod schemas** for validation
3. **Implement handler** following existing domain patterns
4. **Add Swagger documentation** in `src/docs/`
5. **Add tests** for the new endpoint

## 🔐 Authentication & Security

### JWT Authentication

- **Access tokens**: Short-lived (15 minutes)
- **Refresh tokens**: Long-lived (7 days)
- **Secure cookies**: HttpOnly, SameSite=Strict

### Security Middleware

- **Rate limiting**: Per-IP and per-user limits
- **CORS**: Configured for frontend domain
- **Helmet**: Security headers
- **Input validation**: All endpoints use Zod schemas

## 📊 Monitoring & Observability

### Development

- **Structured logging**: JSON logs via Pino
- **Error tracking**: Console logging in development
- **Performance**: Basic Express metrics

### Production Ready

- **Sentry**: Error tracking (configure `SENTRY_DSN`)
- **Mixpanel**: User analytics (configure `MIXPANEL_TOKEN`)

## 🚢 Deployment

### Build for Production

```bash
pnpm build              # TypeScript compilation
pnpm start              # Run production build
```

### Environment Setup

Production requires:

- **PostgreSQL**: With required extensions
- **Redis**: For sessions and queues
- **Environment variables**: See [Environment Guide](../../docs/ENVIRONMENT.md)

### Health Checks

- **GET /health**: Basic health check
- **GET /health/detailed**: Database and Redis connectivity

## 🛠️ Development Workflow

1. **Start development**:

   ```bash
   make api-dev  # From root, or pnpm dev from apps/api
   ```

2. **Make changes** to source files (auto-reloads)

3. **Run quality checks**:

   ```bash
   make check    # Lint, typecheck, format from root
   ```

4. **Run tests**:

   ```bash
   pnpm test     # From apps/api
   ```

5. **Update types** (if adding/changing endpoints):
   ```bash
   # Update types in the appropriate domain file
   # e.g., src/domains/users/users.types.ts
   ```

## 🔍 Common Issues

### Database Connection Issues

If you see connection refused errors:

```bash
make db-up      # Ensure database is running
make db-logs    # Check database startup logs
```

### Migration Issues

For migration-related problems:

```bash
make db-shell   # Connect to database
\dt             # List tables to check state
```

### Type Issues

If TypeScript compilation fails:

```bash
# Update types in domain files as needed
pnpm typecheck  # Check for type errors
```

See [Troubleshooting Guide](../../docs/TROUBLESHOOTING.md) for comprehensive solutions.

## 📚 Key Dependencies

- **Express**: Web framework
- **Knex**: SQL query builder and migrations
- **Zod**: Runtime type validation
- **BullMQ**: Background job queue
- **Pino**: Structured logging
- **Vitest**: Testing framework
- **Supertest**: HTTP testing utilities

## 🤝 Contributing

1. **Follow existing patterns** in the codebase
2. **Add tests** for new functionality
3. **Update types** for API changes
4. **Run quality checks** before committing
5. **Write clear commit messages**
