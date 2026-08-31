export * from './pool.js';
export * from './migrate.js';
export * from './repo/admin.js';
export * from './repo/telegram.js';
export * from './repo/ai-config.js';
export * from './repo/ops.js';

import { createAdminRepo } from './repo/admin.js';
import { createTelegramRepo } from './repo/telegram.js';
import { createAiConfigRepo } from './repo/ai-config.js';
import { createChatRepo, createMemoryRepo, createBlacklistRepo, createOpsRepo, createModerationRepo } from './repo/ops.js';

/** Build all repositories bound to one pool. */
export function createRepos(pool, cryptoHelpers) {
  return {
    admin: createAdminRepo(pool),
    telegram: createTelegramRepo(pool),
    aiConfig: createAiConfigRepo(pool, cryptoHelpers),
    chat: createChatRepo(pool),
    memory: createMemoryRepo(pool),
    blacklist: createBlacklistRepo(pool),
    ops: createOpsRepo(pool),
    moderation: createModerationRepo(pool),
  };
}
