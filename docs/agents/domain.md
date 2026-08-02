# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (doesn't exist yet — proceed silently, see below).
- **`docs/adr/`** — read ADRs that touch the area you're about to work in (doesn't exist yet).

This repo is single-context: one `CONTEXT.md` + `docs/adr/` at the root would cover the whole project, not one per app under `apps/`.

Note: `my-notes/work-queue-close-v2/CONTEXT.md` exists as a domain glossary scoped to that one feature effort. It is not the root context doc and does not make this repo multi-context — treat it as feature-local prior art when working in that area, not as a `CONTEXT-MAP.md` entry.

If `CONTEXT.md` or `docs/adr/` don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (this repo):

```
/
├── CONTEXT.md          ← not created yet
├── docs/adr/            ← not created yet
└── apps/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md` (or, when working in `docs/work-queue-close-v2` / `my-notes/work-queue-close-v2`, the terms defined in `my-notes/work-queue-close-v2/CONTEXT.md`). Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
