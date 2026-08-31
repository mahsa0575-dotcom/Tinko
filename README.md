# BotAI Platform

پلتفرم سازمانی چند-مستأجریِ «بات هوش مصنوعی تلگرام» — یک اکوسیستم کامل شامل بات تلگرام فارسی‌زبان، دروازه‌ی هوش مصنوعی چند-تأمین‌کننده، موتور شخصیت، حافظه بلندمدت، مدیریت گروه، پنل مدیریت و مانیتورینگ بلادرنگ VPS.

> An enterprise multi-tenant AI Telegram platform: Persian-first Telegram bot + universal AI gateway + RBAC-protected REST API + real-time VPS monitoring.

## Architecture at a glance

```
Telegram (polling / webhook)
   ↓  apps/bot — message pipeline (dedup → blacklist → rate limit → moderation
      → relevance → context → memory → personality → AI routing → post-process)
Admin Panel API (Fastify, :8080)           ← apps/api  (JWT-session auth, RBAC, audit)
   ↓
PostgreSQL (schema + migrations)   Redis (rate limit, dedup, BullMQ queues)
   ↓
apps/worker — metrics collector (real VPS data), provider health, retention
   ↓
@botai/ai — provider adapters: OpenAI-compatible | Anthropic | Custom HTTP | Mock
   with model registry, logical profiles ("Smart"/"Fast"), fallback + circuit breaker
```

## Repository layout

| Path | Purpose |
|---|---|
| `packages/core` | Config validation, errors, RBAC, secret crypto, structured logging |
| `packages/db` | pg pool, migration runner, repositories (admin, telegram, AI config, chat, memory, ops) |
| `packages/ai` | Provider adapters, request/response normalization, router with fallbacks, circuit breaker |
| `apps/api` | Fastify server: `/api/v1`, session auth, permission guards, audit, OpenAPI |
| `apps/bot` | grammY bot: full message pipeline, Persian texts, response modes, group admin verification |
| `apps/worker` | BullMQ workers: real VPS metrics, provider health, aggregation, retention |
| `migrations/` | PostgreSQL schema migrations (strict runner, transactional) |

## Quick start (development)

```bash
cp .env.example .env          # then fill DATABASE_URL, REDIS_URL, keys
# 1. Start infrastructure
docker run -d --name botai-pg -e POSTGRES_PASSWORD=... -p 5432:5432 postgres:16-alpine
docker run -d --name botai-redis -p 6379:6379 redis:7-alpine
# 2. Migrate
npm run migrate
# 3. Run services
npm run dev:api      # admin API on :8080
npm run dev:bot      # Telegram bot (polling)
npm run dev:worker   # metrics + health + cleanup
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY
```

The first run creates the platform Super Admin from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` when the `admin_users` table is empty.

## Production deployment (VPS)

```bash
cp .env.example .env    # production values; TELEGRAM_MODE=webhook
docker compose up -d --build
```

- Only `:8080` (API) is public; PostgreSQL/Redis stay on the internal Docker network.
- Put Nginx/Caddy in front for TLS; proxy `api.example.com → api:8080` and the webhook path `→ bot:8081`.
- Native systemd deployment is supported (each app runs standalone with Node ≥ 20).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## API surface (`/api/v1`)

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET/DELETE /auth/sessions`
- `GET|POST|PATCH|DELETE /providers…` + `POST /providers/:id/keys`, `POST /providers/:id/test`
- `GET /models`, `POST /providers/:id/models`, `GET|PUT /model-profiles/:key`
- `GET|POST|PATCH /personalities…`, `GET /personalities/:id/versions`, `POST /personalities/test-chat`
- `GET /groups`, `PATCH /groups/:id/settings`, `GET /users`, `PATCH /users/:id/status`
- `GET|PATCH|DELETE /memories…`, `GET|POST|DELETE /blacklists…`, moderation rules & events
- `GET /analytics/summary`, `GET /analytics/timeseries?metric=…`
- `GET /audit`, `GET /notifications`, `GET /system/health`, `GET /system/diagnostics`
- `GET /resources/latest`, `GET /resources/history` (real VPS metrics)

All errors use `{ "error": { "code", "message", "request_id" } }`; OpenAPI JSON at `/api/v1/openapi.json`.

## Security model

- Provider API keys and bot tokens encrypted at rest (AES-256-GCM), masked in UI responses, never logged.
- Passwords: scrypt. Sessions: 15-min signed access token + rotating HttpOnly refresh cookie; revocable.
- RBAC with granular permissions enforced per route; every admin action is audit-logged.
- Tenant isolation: all queries scope by `tenant_id`; memory scoping is strict (user/group never cross).
- Rate limiting (login + per-user AI), login lockout, generic auth errors (no user enumeration).
- Webhook validates Telegram's `X-Telegram-Bot-Api-Secret-Token`; secrets never in URL parameters.

## Testing

```bash
npm test    # RBAC, crypto+TOTP, Persian profanity engine, provider templates,
            # router fallback + circuit breaker, pipeline behavior, tool safety
```

CI (GitHub Actions) runs the same suite + syntax check + admin panel build on every push.

## Implemented feature set

- **AI gateway**: multi-provider adapters (OpenAI-compatible / Anthropic / Custom HTTP / Mock), model registry, logical profiles, routing with fallback chains + circuit breakers, key pools with LRU rotation, **streaming responses**, **vision**, **speech-to-text**, usage/cost tracking
- **Telegram bot (Persian-first)**: full modular pipeline (dedup → blacklist/shadow → rate limit → anti-spam/flood/raid → Persian profanity + AI moderation → 9 response modes → context → **per-user semantic memory** → personality → tools → streaming reply), group admin verification, escalation ladders (warn → mute → ban)
- **Tools**: calculator (injection-safe), SSRF-guarded URL fetcher, time, per-user remember/recall — function-calling loop with audit
- **Memory**: scoped (global/tenant/group/user/conversation), explicit commands ("یادت باشد" / "فراموش کن"), AI extraction worker, semantic retrieval (embeddings + cosine ranking), admin memory debugger + per-user memory browser
- **Automation**: time/keyword/join triggers → send message, notify admin, change config, with run history
- **Admin Panel** (React + SCSS): dark/light premium blue, RTL fa + LTR en, dashboard, groups (bulk ops, config debugger, templates), users (+per-user memories), providers (+custom builder + key pool + test), models/profiles (+routing debugger), Personality Studio (live test chat), memory (+retrieval debugger), moderation, analytics (+CSV/JSON export), audit, notifications, real-time VPS page (health score, configurable thresholds, anomalies), system health + diagnostics, 2FA security page
- **Ops**: real VPS metrics collector, provider health checks, metric aggregation + retention, cost/resource anomaly detection, alert dedup, backups via pg_dump (docs)

## Roadmap (next phases)

Forums/topics full support · documents (PDF/DOCX) pipeline · passkeys · multi-tenant UI · custom dashboards — see `docs/ARCHITECTURE.md#phases`.
