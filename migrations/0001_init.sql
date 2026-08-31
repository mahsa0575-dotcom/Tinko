-- ============================================================
-- BotAI Platform — initial schema
-- All timestamps are timestamptz (UTC). Money is numeric.
-- Multi-tenant: tenant_id scopes tenant-owned entities.
-- ============================================================

CREATE TABLE schema_migrations (
  id          text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------- Tenancy ----------
CREATE TABLE tenants (
  id          bigserial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','disabled')),
  settings    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Default platform tenant (id=1); single-tenant deployments use this.
INSERT INTO tenants (slug, name) VALUES ('default', 'Platform Default');

-- ---------- Admin panel accounts ----------
CREATE TABLE admin_users (
  id            bigserial PRIMARY KEY,
  tenant_id     bigint NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  email         citext NOT NULL,
  password_hash text NOT NULL,
  display_name  text NOT NULL DEFAULT '',
  telegram_id   bigint,
  totp_secret   text,                -- encrypted at rest; NULL until 2FA enabled
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','locked')),
  failed_logins int NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX idx_admin_users_telegram ON admin_users(telegram_id) WHERE telegram_id IS NOT NULL;

CREATE TABLE admin_sessions (
  id           text PRIMARY KEY,                    -- opaque session id
  admin_id     bigint NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  refresh_hash text NOT NULL UNIQUE,                -- sha256 of refresh token
  user_agent   text,
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);
CREATE INDEX idx_admin_sessions_admin ON admin_sessions(admin_id);

CREATE TABLE roles (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = built-in global role
  key         text NOT NULL,
  name        text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  is_builtin  boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, key)
);

CREATE TABLE user_roles (
  admin_id bigint NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role_id  bigint NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (admin_id, role_id)
);

CREATE TABLE admin_notes (
  id           bigserial PRIMARY KEY,
  tenant_id    bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_id    bigint NOT NULL REFERENCES admin_users(id),
  entity_type  text NOT NULL,   -- user|group|provider|personality|moderation_case
  entity_id    bigint NOT NULL,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_notes_entity ON admin_notes(tenant_id, entity_type, entity_id);

-- ---------- Telegram users ----------
CREATE TABLE telegram_users (
  id             bigserial PRIMARY KEY,
  tenant_id      bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  telegram_id    bigint NOT NULL,
  username       text,
  first_name     text,
  last_name      text,
  language_code  text,
  is_bot         boolean NOT NULL DEFAULT false,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  message_count  bigint NOT NULL DEFAULT 0,
  preferences    jsonb NOT NULL DEFAULT '{}',   -- language, verbosity, style...
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','shadow_ignored','blocked')),
  UNIQUE (tenant_id, telegram_id)
);
CREATE INDEX idx_telegram_users_last_seen ON telegram_users(tenant_id, last_seen_at DESC);

-- ---------- Telegram groups ----------
CREATE TABLE telegram_groups (
  id             bigserial PRIMARY KEY,
  tenant_id      bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  telegram_id    bigint NOT NULL,
  title          text,
  username       text,
  type           text NOT NULL CHECK (type IN ('private','group','supergroup','channel')),
  bot_status     text NOT NULL DEFAULT 'member' CHECK (bot_status IN ('member','administrator','restricted','left','kicked')),
  member_count   int,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_activity  timestamptz NOT NULL DEFAULT now(),
  health         text NOT NULL DEFAULT 'unknown' CHECK (health IN ('healthy','degraded','critical','unknown')),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','orphaned','blacklisted')),
  settings       jsonb NOT NULL DEFAULT '{}',
  UNIQUE (tenant_id, telegram_id)
);
CREATE INDEX idx_groups_activity ON telegram_groups(tenant_id, last_activity DESC);

-- Resolved configuration per group (personality/model/response mode/moderation/memory)
CREATE TABLE group_settings (
  group_id           bigint PRIMARY KEY REFERENCES telegram_groups(id) ON DELETE CASCADE,
  response_mode      text NOT NULL DEFAULT 'mention_reply'
                     CHECK (response_mode IN ('mention','reply','mention_reply','command','always','smart','conversation','admin_only','silent')),
  personality_id     bigint,          -- FK added after personalities table
  model_profile_key  text,            -- logical profile: fast|balanced|smart|reasoning|vision|cheap|premium|long_context
  moderation_policy  text NOT NULL DEFAULT 'balanced' CHECK (moderation_policy IN ('off','relaxed','balanced','strict')),
  memory_policy      text NOT NULL DEFAULT 'conservative' CHECK (memory_policy IN ('off','conservative','standard','aggressive')),
  ai_enabled         boolean NOT NULL DEFAULT true,
  context_messages   int NOT NULL DEFAULT 10,
  temperature        numeric(3,2),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_admins (
  group_id     bigint NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  telegram_id  bigint NOT NULL,
  display_name text,
  tg_role      text NOT NULL CHECK (tg_role IN ('creator','administrator')),
  permissions  jsonb NOT NULL DEFAULT '{}',
  synced_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, telegram_id)
);

CREATE TABLE group_members (
  group_id      bigint NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  telegram_id   bigint NOT NULL,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','administrator','member','restricted','left','kicked')),
  message_count bigint NOT NULL DEFAULT 0,
  last_seen_at  timestamptz,
  PRIMARY KEY (group_id, telegram_id)
);

CREATE TABLE group_tags (
  group_id bigint NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  tag      text NOT NULL,
  PRIMARY KEY (group_id, tag)
);

-- ---------- AI providers ----------
CREATE TABLE providers (
  id            bigserial PRIMARY KEY,
  tenant_id     bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug          text NOT NULL,
  display_name  text NOT NULL,
  kind          text NOT NULL DEFAULT 'openai_compatible'
                CHECK (kind IN ('openai_compatible','anthropic','custom_http','mock')),
  base_url      text,
  config        jsonb NOT NULL DEFAULT '{}',   -- kind-specific: headers template, auth type, parser paths...
  timeout_ms    int NOT NULL DEFAULT 60000,
  max_retries   int NOT NULL DEFAULT 2,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  health        text NOT NULL DEFAULT 'unknown' CHECK (health IN ('healthy','degraded','down','unknown')),
  health_detail jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- Multiple keys per provider with individual health (key pools)
CREATE TABLE provider_keys (
  id          bigserial PRIMARY KEY,
  provider_id bigint NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  label       text NOT NULL DEFAULT '',
  secret_enc  text NOT NULL,                 -- AES-256-GCM
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_error  text,
  last_used_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Model registry ----------
CREATE TABLE models (
  id             bigserial PRIMARY KEY,
  provider_id    bigint NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  identifier     text NOT NULL,                -- provider-native model id
  display_name   text NOT NULL,
  description    text NOT NULL DEFAULT '',
  context_window int,
  max_output     int,
  input_price    numeric(12,8),                -- per 1K tokens
  output_price   numeric(12,8),
  capabilities   text[] NOT NULL DEFAULT '{chat}'
                 CHECK (capabilities <@ '{chat,streaming,vision,audio,tools,embeddings,reasoning,structured}'),
  aliases        text[] NOT NULL DEFAULT '{}',
  priority       int NOT NULL DEFAULT 100,     -- lower = preferred
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, identifier)
);
CREATE INDEX idx_models_status ON models(status, priority);

-- Logical profiles ("Smart", "Fast", ...) mapped to concrete models in priority order
CREATE TABLE model_profiles (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key         text NOT NULL,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE model_profile_models (
  profile_id   bigint NOT NULL REFERENCES model_profiles(id) ON DELETE CASCADE,
  model_id     bigint NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  position     int NOT NULL DEFAULT 0,        -- 0 = primary, 1..3 = fallbacks
  PRIMARY KEY (profile_id, model_id)
);

-- ---------- Personalities ----------
CREATE TABLE personalities (
  id            bigserial PRIMARY KEY,
  tenant_id     bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug          text NOT NULL,
  display_name  text NOT NULL,
  description   text NOT NULL DEFAULT '',
  system_prompt text NOT NULL DEFAULT '',
  config        jsonb NOT NULL DEFAULT '{}',
    -- tone, language, friendliness, humor, verbosity, creativity, formality,
    -- emoji, forbidden/allowed behavior, memory_policy, tool_permissions
  model_profile_key text,
  is_default    boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  current_version int NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

ALTER TABLE group_settings
  ADD CONSTRAINT fk_group_settings_personality
  FOREIGN KEY (personality_id) REFERENCES personalities(id) ON DELETE SET NULL;

CREATE TABLE personality_versions (
  id              bigserial PRIMARY KEY,
  personality_id  bigint NOT NULL REFERENCES personalities(id) ON DELETE CASCADE,
  version         int NOT NULL,
  author_id       bigint REFERENCES admin_users(id),
  summary         text NOT NULL DEFAULT '',
  snapshot        jsonb NOT NULL,   -- full prompt+config at this version
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (personality_id, version)
);

-- ---------- Conversations & messages ----------
CREATE TABLE conversations (
  id             bigserial PRIMARY KEY,
  tenant_id      bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id       bigint REFERENCES telegram_groups(id) ON DELETE CASCADE,
  user_id        bigint REFERENCES telegram_users(id) ON DELETE CASCADE,
  topic_id       bigint,                      -- forum topic
  scope          text NOT NULL CHECK (scope IN ('private','group','topic')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, group_id, user_id, topic_id)
);
CREATE INDEX idx_conversations_last ON conversations(tenant_id, last_message_at DESC);

CREATE TABLE messages (
  id             bigserial PRIMARY KEY,
  conversation_id bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id      bigint NOT NULL,
  role           text NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  user_id        bigint REFERENCES telegram_users(id),
  telegram_message_id bigint,
  content        text NOT NULL,
  content_type   text NOT NULL DEFAULT 'text' CHECK (content_type IN ('text','image','voice','document','tool_result')),
  tokens_in      int,
  tokens_out     int,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_tenant_time ON messages(tenant_id, created_at DESC);

-- ---------- Memory ----------
CREATE TABLE memories (
  id           bigserial PRIMARY KEY,
  tenant_id    bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope        text NOT NULL CHECK (scope IN ('global','tenant','group','user','conversation','personality','admin')),
  group_id     bigint REFERENCES telegram_groups(id) ON DELETE CASCADE,
  user_id      bigint REFERENCES telegram_users(id) ON DELETE CASCADE,
  personality_id bigint REFERENCES personalities(id) ON DELETE CASCADE,
  type         text NOT NULL DEFAULT 'fact'
               CHECK (type IN ('fact','user_preference','group_rule','admin_note','temporary','identity')),
  content      text NOT NULL,
  importance   real NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  confidence   real NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  source       text NOT NULL DEFAULT 'extraction' CHECK (source IN ('extraction','explicit','admin')),
  embedding    jsonb,                        -- float[]; swap to pgvector column when scale requires
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','expired')),
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_memories_scope ON memories(tenant_id, scope, group_id, user_id, status);

-- ---------- Moderation ----------
CREATE TABLE moderation_rules (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id    bigint REFERENCES telegram_groups(id) ON DELETE CASCADE,  -- NULL = tenant-wide
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('wordlist','regex','flood','duplicate','link','mention_spam','ai')),
  pattern     text,
  config      jsonb NOT NULL DEFAULT '{}',   -- thresholds, window, action...
  severity    text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  action      text NOT NULL DEFAULT 'warn'
              CHECK (action IN ('warn','delete','mute','temp_mute','restrict','kick','ban','ignore','escalate')),
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_moderation_rules_scope ON moderation_rules(tenant_id, group_id, enabled);

CREATE TABLE moderation_events (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id    bigint REFERENCES telegram_groups(id) ON DELETE CASCADE,
  user_id     bigint REFERENCES telegram_users(id) ON DELETE CASCADE,
  rule_id     bigint REFERENCES moderation_rules(id) ON DELETE SET NULL,
  category    text NOT NULL,
  severity    text NOT NULL,
  action      text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'done' CHECK (status IN ('pending','done','failed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_moderation_events_time ON moderation_events(tenant_id, created_at DESC);

CREATE TABLE warnings (
  id         bigserial PRIMARY KEY,
  tenant_id  bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id   bigint REFERENCES telegram_groups(id) ON DELETE CASCADE,
  user_id    bigint NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
  reason     text NOT NULL DEFAULT '',
  issued_by  bigint REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_warnings_user ON warnings(tenant_id, group_id, user_id, created_at DESC);

CREATE TABLE blacklists (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('user','group')),
  telegram_id bigint NOT NULL,
  group_id    bigint REFERENCES telegram_groups(id) ON DELETE CASCADE,  -- group-scoped user blacklist
  mode        text NOT NULL DEFAULT 'block' CHECK (mode IN ('block','shadow')),
  reason      text NOT NULL DEFAULT '',
  internal_notes text NOT NULL DEFAULT '',
  expires_at  timestamptz,                 -- NULL = permanent
  created_by  bigint REFERENCES admin_users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_blacklists_lookup ON blacklists(tenant_id, kind, telegram_id);

-- ---------- Automations ----------
CREATE TABLE automations (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id    bigint REFERENCES telegram_groups(id) ON DELETE CASCADE,
  name        text NOT NULL,
  trigger     jsonb NOT NULL,   -- {type:'time'|'message'|'user_joined'|... , config}
  action      jsonb NOT NULL,   -- {type:'send_message'|'notify_admin'|... , config}
  enabled     boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE automation_runs (
  id           bigserial PRIMARY KEY,
  automation_id bigint NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('success','failed','skipped')),
  detail       jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------- Usage & cost ----------
CREATE TABLE usage_records (
  id            bigserial PRIMARY KEY,
  tenant_id     bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id      bigint REFERENCES telegram_groups(id) ON DELETE CASCADE,
  user_id       bigint REFERENCES telegram_users(id) ON DELETE CASCADE,
  provider_id   bigint REFERENCES providers(id) ON DELETE SET NULL,
  model_id      bigint REFERENCES models(id) ON DELETE SET NULL,
  personality_id bigint REFERENCES personalities(id) ON DELETE SET NULL,
  request_kind  text NOT NULL DEFAULT 'chat' CHECK (request_kind IN ('chat','vision','audio','embedding','tool','test','extraction')),
  tokens_in     int NOT NULL DEFAULT 0,
  tokens_out    int NOT NULL DEFAULT 0,
  cost          numeric(14,8) NOT NULL DEFAULT 0,
  currency      text NOT NULL DEFAULT 'USD',
  latency_ms    int,
  status        text NOT NULL CHECK (status IN ('success','error')),
  error_code    text,
  ai_request_id text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_tenant_time ON usage_records(tenant_id, created_at DESC);
CREATE INDEX idx_usage_group ON usage_records(group_id, created_at DESC);
CREATE INDEX idx_usage_user ON usage_records(user_id, created_at DESC);

-- ---------- Audit & notifications ----------
CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id    bigint REFERENCES admin_users(id),
  actor_kind  text NOT NULL DEFAULT 'admin' CHECK (actor_kind IN ('admin','system','bot')),
  action      text NOT NULL,
  entity_type text,
  entity_id   bigint,
  before      jsonb,
  after       jsonb,
  request_id  text,
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_time ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE notifications (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  level       text NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning','critical')),
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  channel     text NOT NULL DEFAULT 'dashboard' CHECK (channel IN ('dashboard','telegram','email','webhook')),
  dedup_key   text,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new','acknowledged','resolved')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_open ON notifications(tenant_id, status, created_at DESC);

-- ---------- System ----------
CREATE TABLE system_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by bigint REFERENCES admin_users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feature_flags (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,                 -- {global:bool, tenant:{id:bool}, group:{id:bool}}
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO feature_flags (key, value) VALUES
  ('vision_enabled', '{"global":true}'),
  ('audio_enabled', '{"global":true}'),
  ('memory_enabled', '{"global":true}'),
  ('web_search_enabled', '{"global":false}'),
  ('ai_moderation_enabled', '{"global":false}');

CREATE TABLE provider_health_checks (
  id          bigserial PRIMARY KEY,
  provider_id bigint NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  ok          boolean NOT NULL,
  latency_ms  int,
  error       text,
  checked_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_provider_health ON provider_health_checks(provider_id, checked_at DESC);

CREATE TABLE service_health (
  service    text PRIMARY KEY,               -- api|bot|worker|scheduler|postgres|redis|telegram
  status     text NOT NULL CHECK (status IN ('online','degraded','offline','unknown')),
  detail     jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz,
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);

-- Resource metrics: raw short-term (history is aggregated by the worker)
CREATE TABLE resource_metrics (
  id          bigserial PRIMARY KEY,
  captured_at timestamptz NOT NULL,
  cpu_percent real,
  cpu_cores   int,
  load_avg    real[],
  mem_total   bigint,
  mem_used    bigint,
  swap_total  bigint,
  swap_used   bigint,
  disks       jsonb,          -- [{mount,total,used,pct}]
  net         jsonb,          -- [{iface,rx_bps,tx_bps}]
  processes   jsonb,
  source      text NOT NULL DEFAULT 'host' CHECK (source IN ('host','container'))
);
CREATE INDEX idx_resource_metrics_time ON resource_metrics(captured_at DESC);

CREATE TABLE resource_aggregates (
  bucket_start timestamptz NOT NULL,
  resolution   text NOT NULL CHECK (resolution IN ('1m','5m','1h')),
  cpu_avg      real, cpu_max real,
  mem_avg      bigint, mem_max bigint,
  swap_avg     bigint,
  disk_pct     jsonb,
  net_rx       bigint, net_tx bigint,
  load_avg     real,
  PRIMARY KEY (resolution, bucket_start)
);

-- Built-in roles (permissions enforced in code; rows here back custom roles & FKs)
INSERT INTO roles (tenant_id, key, name, permissions, is_builtin) VALUES
  (NULL, 'super_admin',     'Super Admin',      '{*}', true),
  (NULL, 'owner',           'Owner',            '{*}', true),
  (NULL, 'administrator',   'Administrator',
   '{groups.read,groups.write,users.read,users.write,models.read,models.write,providers.read,providers.write,personalities.read,personalities.write,memory.read,memory.write,moderation.read,moderation.write,analytics.read,logs.read,settings.read,settings.write,roles.read}', true),
  (NULL, 'group_manager',   'Group Manager',
   '{groups.read,groups.write,users.read,memory.read,memory.write,moderation.read,moderation.write,analytics.read,personalities.read,models.read}', true),
  (NULL, 'ai_manager',      'AI Manager',
   '{providers.read,providers.write,models.read,models.write,personalities.read,personalities.write,analytics.read}', true),
  (NULL, 'security_manager','Security Manager',
   '{security.manage,logs.read,moderation.read,moderation.write,users.read,groups.read,analytics.read}', true),
  (NULL, 'moderator',       'Moderator',
   '{moderation.read,moderation.write,users.read,groups.read}', true),
  (NULL, 'support',         'Support',
   '{users.read,groups.read,memory.read}', true),
  (NULL, 'analyst',         'Analyst',
   '{analytics.read,logs.read,users.read,groups.read}', true),
  (NULL, 'read_only',       'Read Only',
   '{groups.read,users.read,models.read,providers.read,personalities.read,memory.read,moderation.read,analytics.read,logs.read,roles.read,settings.read}', true);
