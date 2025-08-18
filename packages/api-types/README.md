# @accountable-books/api-types

Auto-generated TypeScript types from OpenAPI specifications for the Accountable Books API.

## Overview

This package provides compile-time type safety for API interactions by generating TypeScript types directly from OpenAPI contract specifications. It ensures consistency between the API definition and frontend/backend code.

## Structure

```
packages/api-types/
├── src/
│   ├── generated/
│   │   └── types.ts      # Auto-generated TypeScript types
│   └── index.ts          # Package exports
├── package.json
└── README.md
```

## Usage

### Installation

The package is available as a workspace dependency:

```json
{
  "dependencies": {
    "@accountable-books/api-types": "workspace:*"
  }
}
```

### Basic Type Extraction

```typescript
import type { paths, components } from '@accountable-books/api-types/types';

// Extract endpoint request/response types
type LoginRequest = paths['/auth/login']['post']['requestBody']['content']['application/json'];
type LoginResponse =
  paths['/auth/login']['post']['responses']['200']['content']['application/json'];

// Extract schema component types
type AuthUserContext = components['schemas']['AuthUserContext'];
type ApiResponse = components['schemas']['ApiResponse'];
```

### Type-Safe API Functions

```typescript
import type { paths } from '@accountable-books/api-types/types';
import api from './axios';

type LoginRequest = paths['/auth/login']['post']['requestBody']['content']['application/json'];
type LoginResponse =
  paths['/auth/login']['post']['responses']['200']['content']['application/json'];

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await api.post('/auth/login', data);
  return response.data; // Fully typed response!
}
```

### Example Implementation

See `apps/web/src/lib/typed-api.ts` for a complete example of type-safe API utilities.

## Available Scripts

```bash
# Generate TypeScript types from OpenAPI specs
pnpm run codegen

# Type check the generated code
pnpm run typecheck

# Clean generated files
pnpm run clean
```

## OpenAPI Contract Structure

The types are generated from well-organized OpenAPI specifications:

```
packages/contracts/
├── openapi.yaml           # Main OpenAPI document
├── paths/                 # API endpoint definitions
│   ├── auth.yaml         # Authentication endpoints
│   └── health.yaml       # Health check endpoint
└── components/
    └── schemas/           # Reusable schema components
        ├── auth/          # Auth-specific schemas
        │   ├── LoginForm.yaml
        │   ├── LoginResponse.yaml
        │   ├── AuthUserContext.yaml
        │   └── ...
        └── common/        # Common schemas
            ├── ApiResponse.yaml
            ├── RoleKey.yaml
            └── ...
```

## Build Integration

Fully integrated with Turbo build system:

- **Automatic generation**: Types are generated before builds (`build` depends on `codegen`)
- **Efficient caching**: Generated files are cached for performance
- **Change detection**: Changes to OpenAPI specs trigger regeneration
- **Workspace integration**: Available to all apps and packages

## Available Endpoints

Current API coverage includes:

- **Health Check**: `GET /health`
- **Authentication**:
  - `POST /auth/login` - User login
  - `POST /auth/logout` - User logout
  - `POST /auth/refresh` - Refresh access token
  - `GET /auth/me` - Get current user

## Type Safety Benefits

✅ **Compile-time validation** - Catch API mismatches during development
✅ **Auto-completion** - Full IntelliSense support in IDEs  
✅ **Refactoring safety** - Changes to API contracts are caught immediately
✅ **Documentation** - Types serve as always-up-to-date API documentation
✅ **Consistency** - Single source of truth between API and frontend

## Contributing

When adding new API endpoints:

1. **Define schemas** in `packages/contracts/components/schemas/`
2. **Add paths** in `packages/contracts/paths/`
3. **Reference in main** `packages/contracts/openapi.yaml`
4. **Generate types** with `pnpm run codegen`
5. **Use in frontend** by importing from `@accountable-books/api-types/types`

This workflow ensures type safety across the entire API surface.

## Future Enhancements

While the current TypeScript generation provides excellent compile-time safety, potential future additions include:

- **Runtime validation** with Zod schemas
- **API client generation** with automatic request/response handling
- **Mock data generation** for testing
- **API documentation** generation from the same contracts

The current setup provides a solid foundation for these enhancements.
