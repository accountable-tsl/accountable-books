# Contracts Package

Shared schemas between TypeScript and Python using Zod → Pydantic.

## Structure

- `accountable_contracts/schema/source/` - Source Zod schemas (TypeScript)
- `accountable_contracts/schema/py/` - Generated Pydantic models (Python)
- `accountable_contracts/schema/json/` - Generated JSON schemas (intermediate)
- `accountable_contracts/data/` - Shared data files (TypeScript and Python)

## Usage

**TypeScript:**

```typescript
import { enrichedTransaction } from '@accountable-books/contracts';
```

**Python:**

```python
from accountable_contracts.schema import EnrichedTransaction
```

## Build

```bash
pnpm build              # Generate Pydantic models
pnpm gen:pydantic       # Same as build
pnpm gen:pydantic:no-clean  # Regenerate without cleaning
```

## Adding Schemas

1. Add Zod schema to `accountable_contracts/schema/source/[domain]/`
2. Export from index files
3. Run `pnpm build`
4. Commit generated files

## Data Pipeline

The contracts package includes a data generation pipeline for sharing structured data between TypeScript and Python.

### Structure

- `accountable_contracts/data/source/` - Source data files (TS, JSON, or CSV)
- `accountable_contracts/data/generated/json/` - Canonical JSON format (all data)
- `accountable_contracts/data/generated/ts/` - TypeScript re-exports (when applicable)
- `accountable_contracts/data/config.ts` - Optional configuration for data files

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
data_package = files("accountable_contracts.data.generated.json")
json_file = data_package / "account" / "account-types.json"
account_types = json.loads(json_file.read_text(encoding="utf-8"))

# Or use the helper functions (recommended)
from accountable_contracts.data import account_types
```

````

### Adding Data Files

1. Add source file to `accountable_contracts/data/source/{domain}/`
2. (Optional) Add config to `accountable_contracts/data/config.ts` for schema validation
3. Run `pnpm build` in contracts package
4. Import from `@accountable-books/contracts/data` (TypeScript) or `from accountable_contracts.data import ...` (Python)

### Build

```bash
pnpm build              # Generate data + Pydantic models
pnpm gen:data           # Generate data only
pnpm gen:data:no-clean  # Regenerate without cleaning
````
