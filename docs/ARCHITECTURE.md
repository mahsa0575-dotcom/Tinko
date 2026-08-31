# Architecture

## Design principles

1. **Separation of concerns** — Provider ≠ Model ≠ Capability ≠ Personality ≠ Memory ≠ Group config. Nothing is hardcoded together.
2. **Replaceable pipeline** — every Telegram processing stage is an isolated async function; stages can fail without killing the update.
3. **Provider-agnostic AI** — adapters normalize auth, requests, streaming, errors and retries; the router sees one uniform interface.
4. **Configuration hierarchy** — Platform → Tenant → Group → Role → User → Conversation. Security policy at higher levels always wins.
5. **Real data only** — VPS metrics come from OS APIs (systeminformation); unavailable metrics render as "Unknown", never zero.

## Domains

### Event flow (Telegram update)

```
Telegram Update
 → dedupe (Redis SET NX, 120s)
 → user/group resolution (upsert, settings resolution)
 → blacklist (block | shadow-ignore)
 → rate limit (Redis sliding window, per user per group)
 → moderation (Persian normalization engine + wordlists + DB rules)
 → relevance (response mode: mention/reply/smart/always/…)
 → context (conversation row, recent messages, scoped memories)
 → memory commands ("یادت باشد" / "فراموش کن" / list)
 → personality resolution (group → default) + system prompt assembly
 → typing indicator
 → AI router (profile → candidate chain → circuit breaker → fallback)
 → post-processing (HTML escaping, 4096 split, fallback to plain text)
 → usage tracking + audit
```

### AI gateway

- `AIProviderAdapter` base class: capabilities, `chat()`, `healthCheck()`, normalized errors (`auth|rate_limit|timeout|server_error|bad_response|network|capacity`), retry with exponential backoff + jitter for transient errors only.
- Adapters: `openai_compatible` (OpenAI/DeepSeek/Groq/OpenRouter/Ollama/…), `anthropic`, `custom_http` (visual builder: safe `{{var}}` templates, dotted response paths, 5 auth types), `mock` (deterministic failure modes for tests/sandbox).
- **Model registry**: concrete models with context window, pricing, capabilities, priority.
- **Logical profiles** (`fast`, `balanced`, `smart`, `reasoning`, `vision`, …): ordered concrete-model chains, per tenant. Groups pick "Smart" without knowing providers.
- **Router**: capability filter → candidate chain (primary + 3 fallbacks) → circuit breaker skip → LRU key rotation → usage/cost records per attempt.
- **Circuit breaker**: CLOSED → OPEN (30s) → HALF_OPEN → CLOSED per provider; 5 failures in 60s opens.

### Memory

- Types: fact, user_preference, group_rule, admin_note, temporary, identity.
- Strict scoping: global / tenant / group / user / conversation / personality / admin. Group A memory never leaks into Group B.
- Retrieval ranks by importance + recency; embedding column (`jsonb` float array) is the upgrade path to vector similarity (pgvector) without schema breakage.
- Explicit commands and AI extraction (worker job) write memories; secrets are never stored.

### Security

- Secrets: AES-256-GCM at rest (`v1:iv:tag:ct`), masked display, log redactor as safety net.
- Auth: scrypt passwords; 15-min HMAC access tokens; rotating refresh tokens hashed in DB; session listing/revocation; login lockout (5 fails → 15 min).
- RBAC: granular `domain.action` permissions, built-in roles (Super Admin … Read Only), DB-backed custom roles, per-route guards.
- Tenant isolation enforced in every repository query; audit log for all privileged actions.

### Observability

- Structured JSON logs with `request_id` / `ai_request_id` correlation.
- Service heartbeat table (`api|bot|worker|scheduler`) for health pages.
- Resource pipeline: collector (2s default) → raw (1h retention) → 1m (7d) → 5m (30d) → 1h (1y) aggregates.
- Provider health checks every 5 min with alert deduplication (10-min window).

## Phases

Implemented (Phases 1–5): monorepo & architecture, database & migrations, auth & RBAC, Telegram integration, AI provider abstraction (+ worker/monitoring foundation).

Next: Admin Panel frontend · Personality Studio · vision/audio/documents · AI moderation · automations · backups · CI/CD · load & security testing.
