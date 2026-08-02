# Inline AI + Global Memory Pattern (2026-02-24)

## Problem

Inline AI actions (e.g. "Draft note") need to:

1. Return output directly inside the local UI surface, and
2. Still be remembered by global AI chat history,
3. Without forcing the global sidebar open.

## Implemented Solution

Added an app-wide reusable hook: `useAiInlineAction`.

### What it does

- Sends inline AI requests to `/api/:companyId/ai/chat` using the shared AI transport.
- Appends the inline **user prompt** and **assistant response** into `aiRuntimeStore` thread history.
- Keeps command-bar chat state synchronized from thread storage so inline actions show up in global memory when user opens the sidebar later.
- Does not call `open()` on AI runtime, so sidebar visibility is unchanged.

## New Runtime Building Blocks

- `apps/web/src/modules/ai/runtime/chat-transport.ts`
  - Shared transport factory (`createAiChatTransport`) + chat API URL helper.
- `apps/web/src/modules/ai/runtime/message-mappers.ts`
  - Shared `AiMessage <-> UIMessage` mappers.
- `apps/web/src/modules/ai/runtime/inline-chat-service.ts`
  - Shared inline streaming runner (`runInlineChat`) that collects assistant output.
- `apps/web/src/modules/ai/runtime/use-ai-inline-action.ts`
  - Reusable hook for app-wide inline AI execution and background chat-memory logging.

## Store/Sync Changes

- `aiRuntimeStore` now supports thread-targeted writes:
  - `appendMessageToThread(threadId, message)`
  - `upsertMessageInThread(threadId, message)`
- `AiCommandBar` now uses shared mappers/transport and syncs to persisted thread messages when external updates happen (like inline actions).

## First Consumer Migrated

- `apps/web/src/features/accounting/dashboard-client/pages/shared/notes-panel.tsx`
  - Replaced mock `setTimeout` drafting with `useAiInlineAction`.
  - Keeps inline draft UX while silently logging prompt/response to global chat memory.

## Expected Outcome

Inline and global AI are now unified by thread memory:

- Inline action stays local in UI,
- Sidebar stays closed unless user opens it,
- Global AI context still includes inline prompt/response for follow-up requests.
