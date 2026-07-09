# Contracts Package

Shared schemas between TypeScript and Python using Zod → Pydantic.

## Structure

- `accountable_contracts/schema/source/` - Source Zod schemas (TypeScript) — **edit these**
- `accountable_contracts/schema/py/` - Generated Pydantic models (Python) — **do not commit**
- `accountable_contracts/data/source/` - Source data files (TS, JSON, or CSV) — **edit these**
- `accountable_contracts/data/generated/` - Generated JSON + TS re-exports — **do not commit**
- `accountable_contracts/data/config.ts` - Optional configuration for data files

## Usage

**TypeScript:**

```typescript
import { enrichedTransaction } from '@accountable-books/contracts/schema';
```

**Python:**

```python
from accountable_contracts.schema import EnrichedTransaction
```

## Build

Generated artifacts are **not committed**. After clone or when changing sources, run:

```bash
pnpm -F @accountable-books/contracts build
```

`make setup` and `make dev` run this automatically.

### Scripts

```bash
pnpm build              # Generate data + Pydantic + compile TypeScript
pnpm gen:data           # Generate data only
pnpm gen:pydantic       # Generate Pydantic only
pnpm gen:data:verify    # Check data output without writing (local drift check)
pnpm gen:pydantic:verify  # Check pydantic output without writing
pnpm verify:generated   # Verify both (local drift check before committing sources)
```

## Adding Schemas

1. Add Zod schema to `accountable_contracts/schema/source/[domain]/`
2. Export from index files
3. Run `pnpm build`
4. Commit **source changes only** (not `schema/py/`)

## Data Pipeline

### Usage

**TypeScript/JavaScript:**

```typescript
import {
  defaultAccountTypes,
  defaultAccountTypesJson,
} from '@accountable-books/contracts/data';
```

**Python:**

```python
from accountable_contracts.data import default_account_types
```

### Adding Data Files

1. Add source file to `accountable_contracts/data/source/{domain}/`
2. (Optional) Add config to `accountable_contracts/data/config.ts` for schema validation
3. Run `pnpm build`
4. Commit **source changes only** (not `data/generated/`, `data/index.ts`, or `data/__init__.py`)
