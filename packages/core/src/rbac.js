/**
 * Role Based Access Control definitions.
 * Permissions are granular strings `<domain>.<action>`.
 * Built-in roles bundle permissions; custom roles can be created at runtime.
 */

export const PERMISSIONS = [
  'groups.read', 'groups.write',
  'users.read', 'users.write',
  'models.read', 'models.write',
  'providers.read', 'providers.write',
  'personalities.read', 'personalities.write',
  'memory.read', 'memory.write',
  'moderation.read', 'moderation.write',
  'analytics.read',
  'logs.read',
  'security.manage',
  'system.manage',
  'backups.manage',
  'roles.read', 'roles.write',
  'settings.read', 'settings.write',
];

export const ROLES = {
  SUPER_ADMIN: {
    key: 'super_admin',
    name: 'Super Admin',
    permissions: ['*'],
  },
  OWNER: {
    key: 'owner',
    name: 'Owner',
    permissions: ['*'],
  },
  ADMINISTRATOR: {
    key: 'administrator',
    name: 'Administrator',
    permissions: [
      'groups.read', 'groups.write',
      'users.read', 'users.write',
      'models.read', 'models.write',
      'providers.read', 'providers.write',
      'personalities.read', 'personalities.write',
      'memory.read', 'memory.write',
      'moderation.read', 'moderation.write',
      'analytics.read', 'logs.read',
      'settings.read', 'settings.write',
      'roles.read',
    ],
  },
  GROUP_MANAGER: {
    key: 'group_manager',
    name: 'Group Manager',
    permissions: [
      'groups.read', 'groups.write',
      'users.read',
      'memory.read', 'memory.write',
      'moderation.read', 'moderation.write',
      'analytics.read',
      'personalities.read',
      'models.read',
    ],
  },
  AI_MANAGER: {
    key: 'ai_manager',
    name: 'AI Manager',
    permissions: [
      'providers.read', 'providers.write',
      'models.read', 'models.write',
      'personalities.read', 'personalities.write',
      'analytics.read',
    ],
  },
  SECURITY_MANAGER: {
    key: 'security_manager',
    name: 'Security Manager',
    permissions: [
      'security.manage', 'logs.read',
      'moderation.read', 'moderation.write',
      'users.read', 'groups.read',
      'analytics.read',
    ],
  },
  MODERATOR: {
    key: 'moderator',
    name: 'Moderator',
    permissions: ['moderation.read', 'moderation.write', 'users.read', 'groups.read'],
  },
  SUPPORT: {
    key: 'support',
    name: 'Support',
    permissions: ['users.read', 'groups.read', 'memory.read'],
  },
  ANALYST: {
    key: 'analyst',
    name: 'Analyst',
    permissions: ['analytics.read', 'logs.read', 'users.read', 'groups.read'],
  },
  READ_ONLY: {
    key: 'read_only',
    name: 'Read Only',
    permissions: PERMISSIONS.filter((p) => p.endsWith('.read')),
  },
};

/**
 * Check whether a permission set grants the required permission.
 * `*` grants everything; a domain wildcard `groups.*` also works.
 * @param {string[]} granted
 * @param {string} required
 */
export function hasPermission(granted, required) {
  if (!Array.isArray(granted)) return false;
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  const [domain] = required.split('.');
  return granted.includes(`${domain}.*`);
}

/** Check several permissions; mode 'all' (default) or 'any'. */
export function checkPermissions(granted, required, mode = 'all') {
  const list = Array.isArray(required) ? required : [required];
  return mode === 'any'
    ? list.some((p) => hasPermission(granted, p))
    : list.every((p) => hasPermission(granted, p));
}
