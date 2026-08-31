# Changelog

## [Unreleased] — بازنویسی کامل دیزاین پنل مدیریت

### سیستم طراحی از پایه
- `_tokens.scss`: افزودن مقیاس‌های کامل فاصله (`--sp-0..10`)، شعاع (`--r-xs..full`)، تایپوگرافی (`--fs-2xs..4xl`, `--fw-*`, `--lh-*`)، نردبان z-index، سایه (`--shadow-1..4`) و حرکت؛ پالت تیره و روشن بازنویسی شد
- `base.scss`: ریست، مقیاس تیترها، ابزارهای چیدمان (`.row/.col/.grid*`) و متن، `.page-head`، ۷ کی‌فریم، `.skeleton`، بلوک‌های دسترسی‌پذیری (`prefers-reduced-motion`, `prefers-reduced-transparency`, `@media print`)
- `components.scss`: بازنویسی کامل همهٔ کامپوننت‌ها؛ دکمه‌های مبتنی بر CSS variable، چک‌باکس و اسلایدر استایل‌دار، `.studio` اصلاح شد (`minmax(0,1fr) minmax(0,300px)`)، مودال‌ها زیر ۶۴۰px تبدیل به bottom-sheet
- `layout.scss`: `.shell-main`، ریل آیکونی سایدبار در ۱۱۸۰px، کشوی موبایل در ۷۸۰px با `.sidebar-scrim` — برای اولین بار پنل روی موبایل قابل استفاده شد
- RTL-first: استفاده از `inset-inline-*`, `border-inline-*`, `padding-inline-*` به‌جای left/right

### کامپوننت‌های مشترک
- `ui.jsx`: ۲۸ کامپوننت — افزودن `SectionCard`, `Toolbar`, `SearchInput`, `Field`, `Toggle`, `Checkbox`, `Slider`, `Tabs`, `IconButton`, `List`, `ListRow`, `KV`, `CodeBlock`, `Notice`, `EmptyState`, `Avatar`, `SeverityBadge`, `Pulse`, `LoadingBlock`
- `icons.jsx`: ۲۵ آیکون جدید
- `i18n.js`: ~۴۰ کلید جدید (`col_*` و عمومی) در هر دو دیکشنری فارسی و انگلیسی

### بازنویسی صفحات
- همهٔ ۱۳ صفحه از `PageHeader` استفاده می‌کنند (پیش‌تر فقط ۲ صفحه)
- حذف کامل `window.confirm()` — جایگزینی با `ConfirmDialog` در Providers، Users، Groups، Personalities، Security، Memory
- حذف `<pre>`های استایل‌درون‌خطی — جایگزینی با `CodeBlock` دارای دکمهٔ کپی
- حذف مودال دست‌ساز صفحهٔ VPS و جایگزینی با `<Modal>`
- تب‌های تقلبی (`btn sm primary`) در Analytics و Moderation با کامپوننت واقعی `Tabs` جایگزین شد
- ~۲۵ برچسب ستون انگلیسی در پنل فارسی، فارسی‌سازی شد
- حذف ارجاع‌های داخلی مشخصات (`spec §71`, `spec §139–140`) از متن‌های کاربرپسند
- Dashboard: `ResourceGauge` جدید — رفع نمایش شکستهٔ «در دسترس نیست» در `MetricCard`
- Security: افزودن دکمهٔ افزودن خودکار otpauth (کلید مخفی به سرور ثالث فرستاده نمی‌شود)
- Login: افزودن دکمهٔ نمایش/پنهان‌سازی گذرواژه

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

## [Unreleased] — رفع سه مشکل گزارش‌شده

### ۱. انتخاب ID مدل (کشف مدل از تأمین‌کننده)
پیش از این شناسه‌ی مدل فقط **دستی** تایپ می‌شد و هیچ راهی برای دیدن فهرست
مدل‌های واقعی تأمین‌کننده وجود نداشت.

- `AIProviderAdapter.listRemoteModels()` به‌عنوان قرارداد پایه (پیش‌فرض: `supported:false`)
- پیاده‌سازی برای OpenAI-compatible (`GET /v1/models`)، Anthropic، و Mock
- `normalizeRemoteModel()` — استخراج context window، تبدیل قیمت OpenRouter
  (per-token → per-1M) و استنتاج قابلیت‌ها (vision/audio/tools/embeddings)
- `router.listProviderModels()` با نرمال‌سازی خطا (هرگز hard-fail نمی‌کند)
- API جدید:
  - `GET  /providers/:id/models/discover` — فهرست + علامت‌گذاری ثبت‌شده‌ها
  - `POST /providers/:id/models/import` — ثبت گروهی (حداکثر ۱۰۰، خطای جزئی)
  - `PATCH  /models/:id` — ویرایش مدل
  - `DELETE /models/:id` — حذف با محافظ استفاده در پروفایل (`?force=1`)
- Repo: `getModelForTenant`, `updateModel`, `deleteModel`, `profilesUsingModel`
- `listProfiles` اکنون `identifier`/`display_name`/`provider_slug` را JOIN می‌کند
- **پنل**: مودال «دریافت لیست مدل‌ها» با جستجو، انتخاب چندگانه، ثبت گروهی،
  ثبت تک‌به‌تک با ویرایش، و fallback ثبت دستی وقتی تأمین‌کننده فهرست ندارد
- **رفع باگ**: زنجیره‌ی پروفایل با `providerName(m.model_id)` رندر می‌شد و همیشه
  `#<id>` نشان می‌داد؛ اکنون نام واقعی مدل نمایش داده می‌شود
- افزودن ویرایش/حذف مدل و انتخابگر قابلیت‌ها به پنل + جابه‌جایی ترتیب fallback

### ۲. بهینه‌سازی دیزاین
- حذف `backdrop-filter` از `.card`، `.metric`، `.table-wrap`، سایدبار و تاپ‌بار
  (هر کارت یک لایه‌ی GPU مستقل بود؛ در داشبورد ۱۰–۲۰ لایه)
- ادغام دو لایه‌ی fixed پس‌زمینه (`body::before` + `body::after`) در یک لایه‌ی
  محدودشده به نوار بالایی — حذف یک بافت تمام‌صفحه
- اوربهای صفحه‌ی ورود: `blur(80px)` → `blur(48px)`، فقط یک اورب متحرک
- breakpoint تبلت (۷۶۱–۱۱۰۰px) با سایدبار آیکونی — قبلاً از دسکتاپ مستقیم به موبایل می‌رفت
- گریدهای ثابت (`repeat(4,...)`, `repeat(2,...)`) → `auto-fit` با `min()`
  تا در عرض کم سرریز نکنند (شامل `.vps-top-cards`)
- مودال تمام‌عرض bottom-sheet زیر ۶۴۰px
- احترام به `prefers-reduced-motion` و `prefers-reduced-transparency`
- **رفع باگ**: `@keyframes spin` وجود نداشت — همه‌ی اسپینرهای پنل ساکن بودند

### ۳. CPU / RAM «در دسترس نیست»
**علت اصلی**: `apps/worker/src/jobs/metrics.js` تابع `si.load()` را صدا می‌زد که
در systeminformation **وجود ندارد** (فقط `si.fullLoad()` هست). این reject کل
`Promise.all` را می‌شکست، پس `saveResourceMetrics()` **هرگز** اجرا نمی‌شد.

- بازنویسی کامل collector با ایزوله‌سازی هر probe (timeout ۴s، خطا → `null`)
- خواندن مستقیم `/proc` برای متریک هاست از داخل کانتینر (`HOST_PROC`) —
  چون systeminformation از HOST_PROC پشتیبانی نمی‌کند (با grep در node_modules تأیید شد)
- خواندن محدودیت cgroup v1/v2 (`memory.max`، `cpu.max`، `cfs_quota_us`)
- کش ۱۰ ثانیه‌ای نمونه‌گیری پروسه‌ها
- `docker-compose.yml`: worker با `pid: host` + mount `/proc:/host/proc:ro`
- `/resources/latest` اکنون **دلیل** نبود داده را برمی‌گرداند
  (worker خواب است؟ یا اجرا می‌شود ولی probe خطا می‌دهد) + `ageMs`/`stale`
- worker خطای collector را لاگ می‌کند و snapshot تمام‌null را رد می‌کند
- **پنل VPS**: نمایش وضعیت worker، سن داده، هشدار «کهنه»، و هسته‌های هاست/کوتا

### رفع اضافه
- `platform-routes.js` بدون `import { Errors }` از آن استفاده می‌کرد →
  `ReferenceError` روی `/analytics/timeseries?metric=<unknown>`
