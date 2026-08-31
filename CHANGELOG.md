# Changelog

## 0.4.0 — `tinko` VPS CLI + rename to تینکو

### The `tinko` management CLI (`tinko` script, install via symlink)
- `tinko setup`: fully automated first-run — installs Docker if missing, generates `.env` with random secrets + prints bootstrap admin credentials, builds images, waits for health
- **Status & diagnostics**: `status` (services + CPU/RAM/disk), `diag` (DB/Redis/Telegram/provider-keys/migrations), `stats` (groups/users/messages/tokens/cost/memories + bot name), `logs [service]`
- **Service control**: `start/stop/restart [service]`, `update` (git pull + rebuild + auto-migrations)
- **Backups**: `backup` (DB + .env tarball, 14-version retention), `restore <file>` (with confirmation), cron recipe for nightly 3am backups
- **Emergency controls**: `maintenance on|off` (bot answers only the platform owner), `ai-kill on|off` (global AI kill switch), both stored in `system_settings` and honored by the bot live
- **Admin management** (`scripts/admin.js` in-container CLI): `create/reset/promote/disable/list` — password reset also revokes all sessions
- **Utilities**: `token <BOT_TOKEN>` (writes .env), `webhook set|info`, `migrate`, `psql`, `redis`, `shell`, `cleanup`
- Persian-language interface with colored output

### Identity
- Default bot name is now **تینکو (Tinko)** — changeable anytime from the panel (system_settings `bot_identity`)

## 0.3.1 — Bot name-calling (identity)

- Configurable bot identity: name stored in `system_settings` (`bot_identity`), editable in the panel (Personality Studio header), synced to the bot every 60s
- Persian name-call detection: "هوشیا خوبی؟" triggers a response like a mention — normalized token matching with tolerant suffix (conjugations), no false positives inside unrelated words
- The bot now **replies directly to the calling user's message** in groups and the AI prompt includes the name directive ("user called you by name — answer them personally by name")
- Default name: **هوشیا (Hooshia)** — a fully invented word (هوش + یا)

## 0.3.0 — Streaming, vision/audio, tools, automation, 2FA

### Streaming responses (spec §67)
- OpenAI-compatible SSE adapter (`chatStream`); router streams with fallback semantics (pre-delta failure → next candidate; mid-stream failure → non-streaming)
- Bot edits a "در حال آماده‌سازی پاسخ…" message progressively (~1.5s throttle), final message replaces it

### Vision & audio (spec §57–58)
- Photo messages → base64 data-URL parts routed to vision-capable models (`require:['vision']`)
- Anthropic adapter converts OpenAI-style image parts to native content blocks
- Voice/video-note messages → provider STT (OpenAI `/audio/transcriptions`, whisper-compatible, fa language) → treated as text

### Tool system (spec §61–63)
- OpenAI function-calling loop (max 3 iterations) with user-level tools: `get_current_time`, `calculator` (restricted parser, no eval), `fetch_url` (SSRF-guarded: private-IP blocklist, http(s) only, size/time caps), `remember_for_user`, `list_user_memories`
- Per-group `tools_enabled` switch; every tool invocation audit-logged

### Automation engine (spec §73–74)
- Worker ticks every minute: time triggers (`everyMinutes` / `dailyAt`) → actions `send_message` (group/owner via Bot API), `notify_admin`, `disable_ai`, `change_config`
- Bot fires `message` (keyword regex) and `user_joined` (with `{name}` placeholder) triggers inline; all runs recorded in `automation_runs`

### 2FA & security (spec §121–122)
- Dependency-free TOTP (RFC 6238, ±1 drift) + 8 single-use recovery codes (stored hashed, shown once)
- Login requires TOTP when enabled (`TOTP_REQUIRED` code); panel Security page: setup (secret + otpauth URI), enable/disable, active-session listing & revocation

### Admin panel: per-user memory
- Users list now shows AI-response counts and memory counts for every user the bot answered
- Per-user memory modal: each memory with source (user command / AI extraction / admin), importance, and one-click delete

### Infra
- Migration `0002_depth.sql` (2FA columns, tools_enabled, messages.meta)
- GitHub Actions CI: syntax check, unit tests, admin build, migration sanity
- New tests: TOTP round-trip/drift, arithmetic evaluator injection-safety, HTML cleaning, cosine similarity

## 0.2.0 — Deepened phases 9, 10, 12, 13, 14

### Memory (Phase 9)
- AI memory extraction: post-conversation turns queued to the worker (`ai` queue); strict-JSON extraction prompt caps at 3 durable facts, never stores secrets
- Semantic retrieval: `router.embed()` (embeddings-capable models), cosine ranking blended with importance + recency (`searchRanked`); graceful fallback when no embedding model exists; embedding backfill job every 6h
- Memory debugger in panel: test any query, inspect score/similarity/reason per retrieved memory

### Moderation (Phase 10)
- Anti-spam engine: flood (sliding window), duplicate-content hash, mention spam — Redis-backed, policy-scaled
- Anti-raid: join-spike detection via `chat_member` updates, 10-minute emergency lockdown with critical notification
- AI moderation stage behind `ai_moderation_enabled` flag (JSON verdict: category/confidence/severity)
- Escalation ladder: 3 warnings → 10-min mute, 5 → 1h mute, 8 → ban (Telegram restrict/ban)

### Admin Panel & APIs (Phase 12)
- Config resolution debugger per group (platform → tenant → group → resolved)
- Routing debugger: full fallback chain with circuit states and notes
- Prompt debugger: assembled system layers for a personality/group
- Bulk operations: multi-select groups → personality/profile/moderation/AI on-off/blacklist
- Group templates: 5 built-in (education/gaming/developer/community/strict) + custom templates with preview

### VPS Monitoring (Phase 13)
- Configurable thresholds (cpu/ram/swap/disk/load × warning/high/critical) via panel editor
- Health score (excellent → critical) computed from real metrics + thresholds, shown live
- Resource anomaly scan (sustained CPU/RAM/network deviations vs baseline) with dedup alerts

### Analytics (Phase 14)
- CSV/JSON export of usage records (up to 50k rows) with download in panel
- Hourly cost-anomaly scan (last hour vs 7-day average)

## 0.1.0 — Initial foundation (Phases 1–5 + Admin Panel v1)

### Platform core
- Monorepo: `packages/core|db|ai`, `apps/api|bot|worker|admin`
- PostgreSQL schema (~40 tables) with strict transactional migration runner
- Redis integration: dedup, rate limiting, BullMQ queues

### Security & Auth
- Admin sessions: scrypt passwords, 15-min signed access tokens, rotating HttpOnly refresh cookies, session revocation, login lockout
- RBAC: 10 built-in roles, granular `domain.action` permissions, per-route guards, DB-backed custom roles
- Secrets: AES-256-GCM encryption at rest, masked UI display, log redaction
- Audit logging of all privileged actions; standard API error envelope with request IDs

### AI Gateway
- Provider adapters: OpenAI-compatible, Anthropic, Custom HTTP (safe `{{var}}` templates + JSON-path response mapping, 5 auth types), Mock with failure modes
- Model registry + logical profiles (fast/balanced/smart/…) with ordered fallback chains
- Router with capability filtering, circuit breaker (closed/open/half-open), LRU API-key pools, usage/cost tracking

### Telegram Bot (Persian-first)
- Full modular pipeline: dedup → resolution → blacklist/shadow → rate limit → Persian profanity moderation → 9 response modes → context → memory commands → personality → routing → safe post-processed response
- Group admin verification via real Telegram status; `/settings` panel in Persian
- Polling + secure webhook modes

### Admin Panel (React + SCSS)
- Premium blue design system, dark/light themes, RTL-first (fa) + LTR (en)
- Login, Dashboard, Groups (+settings editor), Users, Providers (+custom builder + key pool + connection test), Models & profiles, Personality Studio with live test chat, Memory manager, Moderation (events/warnings/rules), Analytics charts, Audit, Notifications, System health + diagnostics
- Real-time VPS page: CPU/RAM/SWAP/disk/network/load cards, 30-min history charts, top processes, filesystems
- Command palette (Ctrl+K), toasts, skeletons, empty states

### Ops
- Worker: real OS-level metrics (systeminformation), provider health checks with alerts + dedup, 1m/5m/1h metric aggregation, retention cleanup
- Docker Compose for full VPS deployment; API auto-runs migrations; bot/worker wait for migrations; admin panel served by API
