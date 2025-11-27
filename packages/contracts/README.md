# Contracts Package

Shared schemas between TypeScript and Python using Zod → Pydantic.

## Structure

- `schema/ts/` - Source Zod schemas (TypeScript)
- `schema/py/` - Generated Pydantic models (Python)
- `schema/json/` - Generated JSON schemas (intermediate)

## Usage

**TypeScript:**

```typescript
import { enrichedTransactionSchema } from '@accountable-books/contracts';
```

**Python:**

```python
from accountable_contracts.schema.py.enrichedtransaction import EnrichedTransaction
```

## Build

```bash
pnpm build              # Generate Pydantic models
pnpm gen:pydantic       # Same as build
pnpm gen:pydantic:no-clean  # Regenerate without cleaning
```

## Adding Schemas

1. Add Zod schema to `schema/ts/[domain]/`
2. Export from index files
3. Run `pnpm build`
4. Commit generated files

## Data Pipeline

The contracts package includes a data generation pipeline for sharing structured data between TypeScript and Python.

### Structure

- `data/source/` - Source data files (TS, JSON, or CSV)
- `data/generated/json/` - Canonical JSON format (all data)
- `data/generated/ts/` - TypeScript re-exports (when applicable)
- `data/config.ts` - Optional configuration for data files

### Usage

**TypeScript/JavaScript:**

```typescript
// Import typed data (validated if schema exists)
import { defaultAccountTypes } from '@accountable-books/contracts/data';

// Import JSON directly (runtime access)
import { defaultAccountTypesJson } from '@accountable-books/contracts/data';

// Or import from specific file
import { defaultAccountTypes } from '@accountable-books/contracts/data/generated/ts/account/account-types';
```

**Python:**

```python
# Direct access using importlib.resources
from importlib.resources import files
import json

# Load JSON data from package
# Note: 'data' is a top-level package when installed
data_package = files("data.generated.json")
json_file = data_package / "account" / "account-types.json"
account_types = json.loads(json_file.read_text(encoding="utf-8"))
```

### Adding Data Files

1. Add source file to `data/source/{domain}/`
2. (Optional) Add config to `data/config.ts` for schema validation
3. Run `pnpm build` in contracts package
4. Import from `@accountable-books/contracts/data`

### Build

```bash
pnpm build              # Generate data + Pydantic models
pnpm gen:data           # Generate data only
pnpm gen:data:no-clean  # Regenerate without cleaning
```
