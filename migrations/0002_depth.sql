-- 0002: 2FA support, per-user memory depth, tool permissions (spec §122, §61, §9)

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_codes text[] NOT NULL DEFAULT '{}';

ALTER TABLE group_settings
  ADD COLUMN IF NOT EXISTS tools_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS meta jsonb;
