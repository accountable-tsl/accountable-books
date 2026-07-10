# Frontend Structure Guide

> **Status:** Implemented guide
> **Purpose:** Web app layering (`features` / `modules`) while migrating and building features.

A pragmatic, repeatable structure for organizing the web app. Use this as the source of truth while migrating code and building new features.

## Purpose

- Reduce “where does this go?” decisions.
- Keep domain logic clean and reusable.
- Keep user-facing flows focused on UX.
- Make imports predictable via clear public APIs.

## Layers

- `app`: App shell (providers, router, layouts, app UI chrome).
- `pages`: Route-level components that compose features (no domain logic).
- `features`: End-user flows and UX glue (wizards, steps, toasts, cache invalidation).
- `modules`: Domain logic split by domain/subdomain (types, API, domain hooks, domain-only UI).
- `shared`: Reusable UI kit, utilities, constants, cross-domain types.

## Naming & Conventions

- Directories/files: kebab-case (e.g., `provider-widget.tsx`, `use-bank-accounts.ts`).
- Components: PascalCase export inside file.
- Hooks: `useXxx` naming; filename `use-xxx.ts`.
- Tests: colocate as `*.test.ts(x)` next to the file.
- Barrels: `index.ts` exporting the public surface only (avoid deep imports).

## Where Things Go

- Domain types: `modules/<domain>/<subdomain>/model/types.ts`.
- API clients: `modules/<domain>/<subdomain>/api/index.ts`.
- Domain hooks (React Query, no toasts): `modules/<domain>/<subdomain>/model/hooks.ts`.
- Domain-only UI (reused within the domain): `modules/<domain>/<subdomain>/ui/*`.
- Feature flows (orchestrators, steps, provider widgets, toasts): `features/<feature>/ui|model`.
- Cross-domain types/utils: `shared/types`, `shared/utils`.
- Reusable primitives: `shared/ui/*`.
- App chrome and layouts: `app/layouts`, `app/ui`.
- Routing: `app/router` + `pages/*`.

## Module Layout (Template)

```
modules/
  <domain>/
    <subdomain>/
      api/
        index.ts            # HTTP calls via shared/lib/axios
      model/
        types.ts            # Domain types
        hooks.ts            # Domain hooks (no toasts)
      ui/                   # Domain-specific reusable UI (optional)
      lib/                  # Internal helpers (optional)
      index.ts              # Barrel: export public API from api/model/ui
```

Example (Banking):

```
modules/banking/
  accounts/
  connections/
  transactions/
  institutions/
  providers/
```

### Barrel Example

```ts
// modules/banking/connections/index.ts
export * from './api';
export * from './model/types';
export * from './model/hooks';
```

## Feature Layout (Template)

```
features/
  <feature>/
    ui/                     # Orchestrator, steps, widgets
    model/                  # Feature hooks (toasts, cache invalidation)
    lib/                    # Helpers (optional)
    index.ts                # Export main entry (e.g., ConnectBank)
```

### Barrel Example

```ts
// features/connect-bank/index.ts
export { BankConnectionFlow as ConnectBank } from './ui/connection-flow';
```

## Routing

- `pages/*` render features and arrange layout.
- Routes import features: `import { ConnectBank } from '@features/connect-bank'`.
- Avoid importing `modules/*` directly in pages; pages compose features.

## Data & State

- Single configured HTTP client: `shared/lib/axios.ts`.
- React Query:
  - Domain hooks live in `modules/*/model/hooks.ts` and must remain UI-agnostic (no toasts).
  - Mutation handling depends on complexity:
    - **Simple mutations** (CRUD): Create feature wrapper hooks with toast logic
    - **Complex flows** (multi-step wizards, state transitions): Handle mutations directly in UI components with inline `onSuccess`/`onError` callbacks
- Types:
  - Domain-specific types live in `modules/*`.
  - Cross-domain/shared types live in `shared/types`.

## Imports & Boundaries

- Pages → import from `features/*`, `app/*`, `shared/*`.
- Features → import from `modules/*` (prefer barrels) and `shared/*`.
- Modules → import from `shared/*` only. Do not import from `features/*` or `pages/*`.
- Prefer public barrels (`index.ts`) over deep paths.

Tip (ESLint idea): Add rules to forbid deep imports and cross-layer violations when ready.

## UI Placement

- Shared UI kit: `shared/ui` (buttons, inputs, table pieces).
- App chrome (header, sidebar, shell): `app/layouts` or `app/ui`.
- Domain-specific reusable UI: `modules/<domain>/<subdomain>/ui`.
- Feature-specific UI: `features/<feature>/ui`.

## Testing

- Colocate tests next to their source: `*.test.ts(x)`.
- Test domain logic in `modules/*`.
- Test flow behavior in `features/*`.

## Migration Strategy (`domains-pending-migration`)

- Migrate slice-by-slice (per feature or subdomain) to keep diffs small.
- For each slice:
  1. Create target folders (module or feature) following the templates.
  2. Move files and fix imports locally.
  3. Add/adjust `index.ts` barrels.
  4. Update entry imports (pages/features) to use the new barrels.
  5. Keep temporary shims in old paths only if needed; remove them after references are updated.

## Quick Decision Guide

- Is it a user-facing flow (wizard, steps, toasts, caching UX)? → `features`.
- Is it domain data, types, queries, or logic? → `modules/<domain>/<subdomain>`.
- Is it global UI/utility? → `shared`.
- Is it app shell or layout? → `app`.

## Quick Checklist (For Any New Work)

- Create/use a domain submodule under `modules/<domain>/<subdomain>`.
- Add `api/index.ts`, `model/types.ts`, and `model/hooks.ts`.
- If a flow is needed, create `features/<feature>/ui` and `model`.
- Export via `index.ts` barrels (both module and feature).
- Use kebab-case filenames; hooks start with `use`.
- Keep toasts and UI concerns in features, not modules.
- Import modules via barrels; avoid deep paths.

## Mutation Handling Examples

### Simple CRUD Operations

```ts
// modules/banking/accounts/model/hooks.ts (pure domain hook)
export const useCreateBankAccount = () =>
  useMutation({ mutationFn: createAccount });

// features/manage-accounts/model/use-account-management.ts (feature wrapper)
export const useCreateAccountWithToast = () => {
  const mutation = useCreateBankAccount();
  return {
    ...mutation,
    mutateAsync: async (data) => {
      try {
        const result = await mutation.mutateAsync(data);
        toast.success('Account created successfully!');
        return result;
      } catch (error) {
        toast.error('Failed to create account');
        throw error;
      }
    },
  };
};
```

### Complex Multi-Step Flows

```ts
// features/connect-bank/ui/connection-flow.tsx (inline handling)
const createLinkTokenMutation = useCreateLinkToken();

const createLinkToken = (provider) => {
  createLinkTokenMutation.mutate(
    { provider: provider.key, userId, companyId },
    {
      onSuccess: (response) => {
        setLinkToken(response.data.token);
        setCurrentStep('connecting');
      },
      onError: () => {
        toast.error('Failed to create connection');
      },
    },
  );
};
```

## Concrete Examples (Banking)

- Connect flow (feature):
  - `features/connect-bank/ui/connection-flow.tsx` (complex flow with inline mutation handling)
  - `features/connect-bank/ui/steps/*`
  - `features/connect-bank/ui/providers/*`
- Domain pieces (modules):
  - `modules/banking/connections/api/index.ts` (create link token, exchange token)
  - `modules/banking/connections/model/types.ts` (requests/responses)
  - `modules/banking/providers/model/types.ts` + `providers/utils.ts` (provider config/selection)
  - `modules/banking/accounts/*` (account types/hooks)
  - `modules/banking/transactions/*` (transaction types/hooks; UI flows live in features)

---

Use this guide as the standard for new code. When migrating legacy code, move a small slice, update imports, add barrels, and keep going.

## ESLint (Enforcement, post‑migration)

Install plugins (dev):

```
pnpm -w add -D eslint-plugin-import eslint-plugin-boundaries
```

Update `eslint.config.mjs` (Flat config) with layered boundaries and import hygiene. Enable after migration; until then, scope it to `apps/web/src` and optionally exclude `domains-pending-migration`.

```js
import boundaries from 'eslint-plugin-boundaries';
import importPlugin from 'eslint-plugin-import';

export default [
  // ...existing configs
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    // Temporarily exclude legacy code while migrating
    ignores: ['apps/web/src/domains-pending-migration/**'],
    plugins: {
      import: importPlugin,
      boundaries,
    },
    settings: {
      // Define architectural layers for boundaries
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/web/src/app/**' },
        { type: 'pages', pattern: 'apps/web/src/pages/**' },
        { type: 'features', pattern: 'apps/web/src/features/**' },
        { type: 'modules', pattern: 'apps/web/src/modules/**' },
        { type: 'shared', pattern: 'apps/web/src/shared/**' },
      ],
    },
    rules: {
      // Enforce layer boundaries
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message: 'Layer violation: {{from}} cannot import {{to}}',
          rules: [
            { from: ['app'], allow: ['features', 'shared'] },
            { from: ['pages'], allow: ['features', 'shared'] },
            { from: ['features'], allow: ['modules', 'shared'] },
            { from: ['modules'], allow: ['shared'] },
            { from: ['shared'], allow: [] },
          ],
        },
      ],

      // Prevent deep imports; prefer barrels
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // Block deep imports into modules and features internals
            {
              group: ['@/modules/*/*/*'],
              message: 'Use module barrels; avoid deep imports.',
            },
            {
              group: ['@/features/*/*/*'],
              message: 'Use feature barrels; avoid deep imports.',
            },
          ],
        },
      ],

      // Keep imports tidy and grouped
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'type',
          ],
          pathGroups: [
            { pattern: '@app/**', group: 'internal', position: 'before' },
            { pattern: '@pages/**', group: 'internal', position: 'before' },
            { pattern: '@features/**', group: 'internal', position: 'before' },
            { pattern: '@modules/**', group: 'internal', position: 'before' },
            { pattern: '@shared/**', group: 'internal', position: 'before' },
            { pattern: '@/**', group: 'internal', position: 'before' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
];
```

Tip: When migration is complete, remove the `ignores` entry for `domains-pending-migration` to enforce across all code.

## TS Path Aliases (for predictable imports)

In `apps/web/tsconfig.json`, extend paths to match layers:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@app/*": ["./src/app/*"],
      "@pages/*": ["./src/pages/*"],
      "@features/*": ["./src/features/*"],
      "@modules/*": ["./src/modules/*"],
      "@shared/*": ["./src/shared/*"],
      "@/*": ["./src/*"]
    }
  }
}
```

Keep imports using these aliases; it makes boundary rules more effective and code easier to navigate.

## Import Strategy (Relative vs `@/`)

- Use `@/*` aliases for cross-folder imports between layers.
  - Pages → `@features/*`, `@app/*`, `@shared/*`
  - Features → `@modules/*`, `@shared/*`
  - Modules → `@shared/*`
- Use relative imports only for same-folder or very-near files.
  - Good: `./utils`, `./model/types`, `../components/foo`
  - Avoid: deep relatives like `../../../../shared/utils` — prefer `@shared/*`.
- Prefer barrels over deep paths.
  - Good: `import { createLinkToken } from '@modules/banking/connections'`
  - Avoid: `@modules/banking/connections/api/index`

Examples:

```ts
// Feature importing domain hook via barrel

// Page importing a feature entry
import { ConnectBank } from '@features/connect-bank';
import { useUploadBankTransactions } from '@modules/banking/transactions';
// Module importing shared utility
import { queryClient } from '@shared/lib/queryClient';

// Local file within the same folder
import { StepHeader } from './step-header';
```

## Recommended Modules and Submodules

Modules (domains) should be small, cohesive, and stable. Use kebab-case names.

- auth
  - credentials: login/signup API + types/hooks
  - session: me/csrf API + types/hooks (app-level provider stays under `app/providers`)
- company
  - companies: company profile/details API + types
  - firms: firm/tenant metadata (if distinct from company)
  - settings: financial/accounting settings (basis, FY, etc.)
- banking
  - connections: link/exchange token API, provider selection, country utils
  - accounts: bank account CRUD, selectors
  - transactions: upload/import APIs, normalization, domain hooks
  - institutions: list/search banks
  - providers: provider keys/metadata and selection utilities
- accounting
  - workspace: accounting workspace context/data
  - chart-of-accounts: COA types, APIs, hooks
  - categorization: rules/suggestions domain (cat-engine domain side)
- identity (optional if separate from auth)
  - users: user profile, members, invites
  - permissions: RBAC/ACL checks, roles, policies
- contacts
  - contacts: customers/vendors (types, API, hooks)
- projects (optional based on usage)
  - projects: core types, API, hooks
- files (optional)
  - uploads: generic file parsing utilities (or colocate within domain)

This typically yields ~7–8 core modules with 1–5 submodules each.

## Feature Folders

Create one folder per user-facing flow under `features/`:

- auth-login
- auth-signup
- onboarding
- connect-bank
- add-bank-transaction
- manage-bank-accounts
- accounting-setup
- cat-engine

Each feature contains `ui/`, `model/` (toasts, cache invalidation), optional `lib/`, and `index.ts` that exports the feature entry.

## Migration Mapping (Cheat Sheet)

- banking
  - `bank-accounts` → `modules/banking/accounts`
  - `bank-transactions` → domain bits to `modules/banking/transactions`; UI flows to `features/add-bank-transaction`
  - `banks` → `modules/banking/institutions`
  - `bankFeedProviders` → `modules/banking/providers`
  - `bankConnection/connectViaFeed + widgets` → `features/connect-bank/ui/providers`
- accounting
  - `accounting-ws` → `modules/accounting/workspace`
  - `coa` → `modules/accounting/chart-of-accounts`
  - `cat-engine` → feature UI to `features/cat-engine`; domain to `modules/accounting/categorization`
  - `accounting-setup` → `features/accounting-setup`
- auth
  - Domain calls in `modules/auth/{credentials,session}`; UI flows in `features/auth-*`
- company
  - `company + financial-settings + firms` → `modules/company/{companies,settings,firms}`
