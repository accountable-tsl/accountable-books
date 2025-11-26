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
