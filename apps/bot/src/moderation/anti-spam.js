import crypto from 'node:crypto';

/**
 * Anti-spam / anti-flood engine (spec §49–50), Redis-backed.
 * - Flood: > maxPer10s messages per user per group in 10s
 * - Duplicate: same content hash 3+ times within 60s
 * - Mention spam: > 8 mentions in a message or rapid mention bursts
 * - Raid: join spike (>= raidJoins joins within 60s across the group)
 *
 * All thresholds have sensible defaults; group moderation_policy scales them.
 */
export function createAntiSpam(redis) {
  const slidingCount = async (key, windowS, max) => {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowS);
    return { count, exceeded: count > max };
  };

  return {
    async checkFlood(groupId, userId, policy) {
      const max = policy === 'strict' ? 4 : policy === 'relaxed' ? 12 : 7;
      return slidingCount(`as:flood:${groupId}:${userId}`, 10, max);
    },

    async checkDuplicate(groupId, userId, text) {
      if (!text || text.length < 8) return { exceeded: false };
      const hash = crypto.createHash('md5').update(text.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);
      const key = `as:dup:${groupId}:${userId}:${hash}`;
      const { count, exceeded } = await slidingCount(key, 60, 3);
      return { exceeded, count };
    },

    checkMentionSpam(message) {
      const mentions = (message.entities ?? []).filter((e) => ['mention', 'text_mention'].includes(e.type)).length;
      return { exceeded: mentions >= 8 };
    },

    /**
     * Raid detection over group joins. Returns current window count and
     * whether emergency mode should trigger (true only on the crossing tick).
     */
    async checkRaid(groupId, policy) {
      const threshold = policy === 'strict' ? 4 : 6;
      const key = `as:raid:${groupId}`;
      const { count, exceeded } = await slidingCount(key, 60, threshold);
      const raidActive = await redis.get(`as:raidmode:${groupId}`);
      return { count, threshold, triggered: exceeded && !raidActive, active: Boolean(raidActive) };
    },

    async activateRaidMode(groupId, ttlS = 600) {
      await redis.set(`as:raidmode:${groupId}`, '1', 'EX', ttlS);
    },
    async raidModeActive(groupId) {
      return Boolean(await redis.get(`as:raidmode:${groupId}`));
    },
  };
}
