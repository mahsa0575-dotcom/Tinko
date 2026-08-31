import { describe, it, expect } from 'vitest';
import { hasPermission, checkPermissions, ROLES } from '../src/rbac.js';
import { hashPassword, verifyPassword, encryptSecret, decryptSecret, maskSecret } from '../src/crypto.js';
import { loadConfig } from '../src/config.js';

describe('RBAC', () => {
  it('grants everything with wildcard', () => {
    expect(hasPermission(['*'], 'groups.write')).toBe(true);
  });
  it('grants exact permission', () => {
    expect(hasPermission(['groups.read', 'users.read'], 'groups.read')).toBe(true);
    expect(hasPermission(['groups.read'], 'groups.write')).toBe(false);
  });
  it('supports domain wildcard', () => {
    expect(hasPermission(['groups.*'], 'groups.write')).toBe(true);
    expect(hasPermission(['groups.*'], 'users.read')).toBe(false);
  });
  it('built-in roles have valid permission entries', () => {
    for (const role of Object.values(ROLES)) {
      for (const p of role.permissions) {
        expect(p === '*' || p.endsWith('.*') || p.includes('.')).toBe(true);
      }
    }
  });
  it('read_only role only has read permissions', () => {
    expect(ROLES.READ_ONLY.permissions.every((p) => p.endsWith('.read'))).toBe(true);
  });
  it('checkPermissions modes', () => {
    const granted = ['groups.read', 'users.read'];
    expect(checkPermissions(granted, ['groups.read', 'users.read'])).toBe(true);
    expect(checkPermissions(granted, ['groups.read', 'groups.write'], 'any')).toBe(true);
    expect(checkPermissions(granted, ['groups.read', 'groups.write'])).toBe(false);
  });
});

describe('crypto', () => {
  const key = 'a'.repeat(64);
  it('password hashing round-trip', () => {
    const hash = hashPassword('S3cure!Pass');
    expect(verifyPassword('S3cure!Pass', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });
  it('secret encryption round-trip and tamper detection', () => {
    const enc = encryptSecret('sk-test-123', key);
    expect(decryptSecret(enc, key)).toBe('sk-test-123');
    expect(() => decryptSecret(enc.slice(0, -4) + 'AAAA', key)).toThrow();
  });
  it('masking never reveals the secret', () => {
    const masked = maskSecret('sk-1234567890abcdefgh');
    expect(masked).not.toContain('1234567890abcdefgh');
    expect(masked.startsWith('sk-…')).toBe(true);
  });
});

describe('config validation', () => {
  it('fails fast on missing required variables', () => {
    expect(() => loadConfig({})).toThrow(/Invalid environment configuration/);
  });
  it('accepts a valid environment', () => {
    const env = {
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      ENCRYPTION_KEY: 'a'.repeat(64),
      SESSION_SECRET: 'x'.repeat(32),
    };
    const config = loadConfig(env);
    expect(config.API_PORT).toBe(8080);
    expect(config.NODE_ENV).toBe('development');
  });
});
