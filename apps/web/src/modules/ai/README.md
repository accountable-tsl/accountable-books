# Web AI Registration (Domains + Capabilities)

This folder contains the **app-level AI runtime** (state, UI shell, registration).

AI shows up in the app only when:

1. `VITE_AI_ENABLED=true`, and
2. The current page has at least one **registered, enabled** capability.

## 1) Where Capabilities Are Registered

Registrations are **page/domain-owned** and live next to the feature that owns them.

Pattern:

- Create a registration file in the feature:
  - `apps/web/src/features/<feature>/ai/registration.ts`
- In the page component, register on mount:
  - `useRegisterAiDomain(...)`

Example (Cat Engine):

- Registration: `apps/web/src/features/cat-engine/ai/registration.ts`
- Mounted in page: `apps/web/src/features/cat-engine/ui/cat-engine.tsx`

## 2) How The App Knows A Page’s “Domain”

For MVP, the domain is **declared by the page itself** via registration.

- A page calls `useRegisterAiDomain({ domain: "categorization", ... })`.
- The runtime stores the registration and sets `activeDomain` to that domain.
- The global command bar uses the registrations to show domain chips and capabilities.

Use the central keys to avoid drift:

- Domains: `AI_DOMAINS.categorization`, `AI_DOMAINS.journals`, etc.
- Capabilities: `makeCapabilityId({ domain, name, version })`

This avoids maintaining a separate “route -> domain” registry while we iterate quickly.

## 3) Disabling AI Per Domain / Capability (MVP)

These are UI-level controls (UX gating) and are persisted in local storage:

- `VITE_AI_ENABLED`
- `VITE_AI_DISABLED_DOMAINS` (comma-separated domain keys)
- `VITE_AI_DISABLED_CAPABILITIES` (comma-separated capability IDs)
- `VITE_AI_ENABLED_DOMAINS` (optional allowlist; comma-separated)
- `VITE_AI_ENABLED_CAPABILITIES` (optional allowlist; comma-separated)

If a page has no registered enabled capabilities, the AI launcher and command bar are not rendered,
and `Cmd+K` does nothing.

## 4) When We Should Add A Route/Domain Registry

Add an explicit registry if/when you need:

- Central per-page enable/disable without modifying page code.
- Consistent domain assignment independent of registration order.
- More advanced scoping (selected entity IDs, page context injection).

The clean way to do that in this codebase is to attach an `aiDomainKey` to route metadata and let the
app-level AI provider derive the domain from the current route.

## 5) Inline AI Actions (No Sidebar Open)

Use `useAiInlineAction(...)` for app-level reusable inline AI buttons (e.g. "Draft note",
"Generate description", "Summarize row") when you need:

- Inline result rendering in the local component UI
- Background logging into the active global AI thread memory
- No forced open of the AI command bar/sidebar

Behavior:

- Appends the inline user prompt + assistant response to `aiRuntimeStore` thread messages.
- Sends the request through the same chat transport (`/api/:companyId/ai/chat`) with CSRF headers.
- Keeps global chat memory in sync so the user can continue in sidebar later.
