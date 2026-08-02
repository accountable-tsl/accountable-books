# AI Setup Review (2026-02-24)

## Scope

This note documents the current AI setup in the repo as of **February 24, 2026**.
It covers:

- App-level generative AI chat (web + API)
- AI approvals and telemetry infrastructure
- ML categorization engine integration
- Implementation gaps that affect product decisions

---

## Executive Summary

The project has a solid baseline for:

- AI shell + command bar UX in web
- Streaming chat endpoint in API
- Capability registry and domain gating
- Basic AI run telemetry and audit events
- A separate ML categorization pipeline (rules-first, ML fallback)

Main gaps:

1. Approval execution is still stubbed (no real tool dispatch yet).
2. Capability safety policy is defined but not enforced at runtime.
3. Several AI-assist buttons in product areas still use mock `setTimeout` behavior.
4. Local defaults can make AI look enabled in UI while backend AI is disabled.

---

## 1) Generative AI (Web + API) - Current State

### Web Runtime

- App-level runtime is mounted globally in the dashboard layout via `AiRuntimeProvider`.
- AI is controlled by env-driven policy in Zustand:
  - `VITE_AI_ENABLED`
  - domain/capability allowlists and denylists
- Page domains register capabilities via `useRegisterAiDomain(...)`.
- Command bar sends chat requests with selected `capabilityId` and `domain`.
- Transport uses AI SDK `DefaultChatTransport` to stream responses.

### API Runtime

- Chat endpoint is mounted at `POST /api/:companyId/ai/chat`.
- Requests are validated against contracts schema (`capabilityId`, `messages`, optional `domain`).
- Backend guards:
  - `AI_ENABLED` must be true
  - `OPENAI_API_KEY` must exist
- Capability is resolved from allowlisted registry (single source of truth with contracts IDs).
- Runner currently uses OpenAI only, via AI SDK `streamText`.
- Responses stream to UI; failures are returned as assistant text messages.

### Capability Model

Supported domains/capabilities now:

- `journals.*` (`from_text`, `generate_memo`, `dev_sample`)
- `categorization.*` (`interpret_command`, `clean_description`, `explain`, `dev_sample`)
- `reporting.*` (`explain`, `dev_sample`)

Capability system prompts are defined server-side and mapped per capability.

---

## 2) Telemetry, Audit, and Pricing - Current State

- API writes best-effort audit events for:
  - `ai.chat.requested`
  - `ai.chat.finished`
- API persists chat runs in `ai_chat_runs`:
  - status, finish reason, token usage, model, provider, metadata
- Pricing table `ai_model_pricing` exists and cost estimation logic is implemented.
- Cost is computed when model pricing exists for provider/model/effective timestamp.
- Provider type is currently hardcoded to `openai`.

### Not Yet Wired

- `ai_tool_runs` table exists but there is no runtime code writing tool run rows yet.

---

## 3) Approvals - Current State

What exists:

- `ai_approvals` table + store + controller endpoints:
  - `POST /api/:companyId/ai/approvals/:approvalId/execute`
  - `POST /api/:companyId/ai/approvals/:approvalId/reject`

What is missing:

- `executeApproval` still contains TODO dispatch logic and currently returns a placeholder result.
- There is no real tool registry execution path wired through approvals yet.

Implication: approval infrastructure is scaffolded, but deterministic mutation execution is not live.

---

## 4) Safety and Control - Current State

Implemented:

- Company access enforcement (`checkCompanyId`)
- Conservative API limiter on AI routes (`basicLimiter`)
- Capability allowlist in contracts + API registry (unknown capability rejected)

Defined but not enforced:

- Capability policy fields (`maxSteps`, `maxToolCalls`, `maxRepeatToolCalls`, `timeoutMs`) are configured but not applied in runner execution.

Implication: policy model exists, but operational guardrails still need runtime enforcement.

---

## 5) Product Surface Reality (Live vs Mock)

### Live Chat Surface

- Global AI command bar is the primary real integration path to `/ai/chat`.

### Mock/Placeholder AI Actions Still Present

- Journals detail:
  - "Suggest entries" behavior is mock line balancing logic
  - "Generate/Improve description" is mock and marked TODO for `/ai/chat`
- Reporting notes panel:
  - Draft generation uses simulated delay + static text
- Insights panel:
  - Uses mock insight generation and local staleness/fingerprint logic
  - AI button opens command bar with prefilled prompt (real handoff), but source insight content is mock

Implication: AI affordances are widespread, but only some are truly model-backed today.

---

## 6) ML Categorization Setup - Current State

Architecture:

- Bank transaction enrichment triggers rules engine first.
- After rules transaction commits, ML prediction is enqueued when needed.
- ML call path:
  - API worker -> `getMLEngineClient()` -> ML Engine `/api/v1/predict`
- ML result is schema-validated in API before post-prediction processing.
- Current ML source label is `ml_heuristic` (explicitly set).

ML Engine:

- FastAPI service with:
  - `/health`
  - `/api/v1/predict`
- Uses:
  - heuristic global intent classifier (Model A)
  - heuristic tenant ranker (Model B with embeddings)
  - accrual resolver
- COA fetch failures degrade gracefully (continues with defaults/fallback behavior).

Implication: ML path is live and integrated, but positioned as heuristic baseline rather than trained production ML.

---

## 7) Configuration Snapshot (Important)

Local defaults currently imply:

- Web AI shell: **enabled** by default (`VITE_AI_ENABLED=true`)
- API generative AI: **disabled** by default (`AI_ENABLED=false`)

This can produce UX confusion where AI UI appears available while backend chat responds unavailable unless API env is explicitly enabled and key configured.

---

## 8) Decision-Relevant Gaps (Priority)

### High

1. Approval execution not implemented (tool dispatch TODO).

### Medium

2. Capability policy exists but not enforced.
3. Several in-feature AI actions are still mock implementations.
4. Web/API local AI defaults are misaligned for seamless dev UX.

### Low

5. Chat context fields (`route`, `pageTitle`) are supported server-side but not sent from command bar.
6. Backend does not attach assistant message metadata; client patches metadata locally.

---

## 9) Practical Interpretation

Today’s setup is best described as:

- **Production-capable AI shell + streaming chat baseline**
- **Scaffolded agent/tooling architecture not yet fully operational**
- **Mature-ish ML categorization pipeline operating in heuristic mode**

This is a strong foundation for phased hardening, especially if next decisions focus on:

- completing deterministic approval execution,
- enforcing runtime capability policy,
- converting mock assist buttons into real `/ai/chat` integrations,
- and aligning env defaults for predictable local behavior.
