# ============================================================
# BotAI Platform — VPS Deployment Guide
# Everything installs automatically via Docker on first run.
# ============================================================

## ⚡ Fast path — the `tinko` CLI (recommended)

Copy the project to the VPS, then:

```bash
sudo ln -sf "$(pwd)/tinko" /usr/local/bin/tinko
tinko setup            # everything: docker, .env with random secrets, build, run
```

`tinko setup` prints your generated admin password. Then:

```bash
tinko token <BOT_TOKEN>   # از BotFather
tinko webhook set         # تنظیم وبهوک
tinko status | diag | stats
```

Full command list: `tinko help` — includes start/stop/restart, live logs,
backup/restore (14-version retention), `maintenance on|off`, `ai-kill on|off`,
admin management (create/reset/promote/disable), psql/redis shells and cleanup.

Recommended: nightly backup cron:

```bash
(crontab -l 2>/dev/null; echo "0 3 * * * $(pwd)/tinko backup >> /var/log/tinko-backup.log 2>&1") | crontab -
```

## Classic path — manual Docker Compose

## 0. Prerequisites on the VPS (one-time)

Ubuntu/Debian:

```bash
curl -fsSL https://get.docker.com | sh        # Docker + Compose plugin
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
```

AlmaLinux/Rocky:

```bash
dnf install -y docker-ce docker-compose-plugin   # after adding docker repo
firewall-cmd --permanent --add-service={http,https,ssh} && firewall-cmd --reload
```

## 1. Get the code onto the VPS

```bash
git clone <your-repo> botai && cd botai       # or upload the folder
```

## 2. Configure once

```bash
cp .env.example .env
nano .env
```

Fill in:

| Variable | Notes |
|---|---|
| `DATABASE_PASSWORD` | a strong password; also used inside `DATABASE_URL` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` — encrypts provider API keys at rest |
| `SESSION_SECRET` | `openssl rand -hex 32` — signs admin sessions |
| `BOOTSTRAP_ADMIN_EMAIL/PASSWORD` | first admin panel account (only used once) |
| `TELEGRAM_BOT_TOKEN` | from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 24` |
| `PUBLIC_BASE_URL` | `https://panel.example.com` (your TLS domain) |

## 3. Start (installs everything automatically)

```bash
docker compose up -d --build
```

What happens automatically on the VPS:

1. PostgreSQL 16 and Redis 7 containers start (internal network only).
2. All npm dependencies install **inside** the images — nothing installs on the host.
3. The Admin Panel React app is built inside the API image.
4. Database migrations run automatically before the API starts.
5. API serves panel + REST on `:8080`; bot connects (webhook mode) on internal `:8081`.

Check status: `docker compose ps` · logs: `docker compose logs -f api`

## 4. TLS / reverse proxy (one command options)

Caddy (recommended, automatic HTTPS):

```
# /etc/caddy/Caddyfile
panel.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
systemctl reload caddy
```

Nginx + certbot alternative:

```nginx
server {
    server_name panel.example.com;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

The Telegram webhook works through the same domain (Telegram POSTs to
`https://panel.example.com/webhooks/telegram`; the panel UI has no separate routing needs).

## 5. First login

Open `https://panel.example.com` → login with `BOOTSTRAP_ADMIN_*` → then:

1. **تأمین‌کنندگان**: add a provider (OpenAI/Anthropic/custom…) + API key → Test
2. **مدل‌ها**: register the model(s), map logical profiles (balanced/smart/…)
3. **شخصیت‌ها**: create the default personality
4. Add the bot to a Telegram group and send `/settings`

## Updating

```bash
git pull && docker compose up -d --build
```

Migrations are idempotent; `schema_migrations` tracks applied versions.

## Backups (database)

```bash
docker compose exec -T postgres pg_dump -U botai botai | gzip > backup-$(date +%F).sql.gz
```

## Troubleshooting

| Symptom | Check |
|---|---|
| API restarts at boot | `docker compose logs api` — usually bad `.env` (invalid ENCRYPTION_KEY format) |
| Bot idle | `TELEGRAM_BOT_TOKEN` empty, or webhook domain not reachable over HTTPS |
| No VPS metrics | worker container running? `docker compose ps worker` |
| Provider test fails | key invalid/expired; check the provider's health badge and API quota |
