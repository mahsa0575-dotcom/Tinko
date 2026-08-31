/** Conversations, messages, memories, blacklists, usage, audit, notifications. */

export function createChatRepo(pool) {
  return {
    resolveConversation: async (tenantId, { groupId = null, userId = null, topicId = null, scope }) => {
      const { rows } = await pool.query(
        `INSERT INTO conversations (tenant_id, group_id, user_id, topic_id, scope)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, group_id, user_id, topic_id)
         DO UPDATE SET last_message_at = now() RETURNING *`,
        [tenantId, groupId, userId, topicId, scope]);
      return rows[0];
    },
    addMessage: async (conversationId, tenantId, m) => {
      const { rows } = await pool.query(
        `INSERT INTO messages (conversation_id, tenant_id, role, user_id, telegram_message_id, content, content_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [conversationId, tenantId, m.role, m.userId ?? null, m.telegramMessageId ?? null,
         m.content, m.contentType ?? 'text']);
      return rows[0];
    },
    recentMessages: async (conversationId, limit) => {
      const { rows } = await pool.query(
        `SELECT role, user_id, content, content_type, created_at
         FROM messages WHERE conversation_id = $1
         ORDER BY created_at DESC LIMIT $2`, [conversationId, limit]);
      return rows.reverse();
    },
  };
}

export function createMemoryRepo(pool) {
  return {
    create: async (tenantId, m) => {
      const { rows } = await pool.query(
        `INSERT INTO memories (tenant_id, scope, group_id, user_id, personality_id, type, content,
                               importance, confidence, source, embedding, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [tenantId, m.scope, m.groupId ?? null, m.userId ?? null, m.personalityId ?? null,
         m.type ?? 'fact', m.content, m.importance ?? 0.5, m.confidence ?? 0.8,
         m.source ?? 'extraction', m.embedding ? JSON.stringify(m.embedding) : null, m.expiresAt ?? null]);
      return rows[0];
    },
    search: async (tenantId, { groupId, userId, scope, limit = 10 }) => {
      // Candidate retrieval by scope + recency + importance.
      // Vector similarity is layered in by the memory engine when embeddings exist.
      const { rows } = await pool.query(
        `SELECT * FROM memories
         WHERE tenant_id = $1 AND status = 'active'
           AND (expires_at IS NULL OR expires_at > now())
           AND (scope = ANY($2))
           AND (scope <> 'group' OR group_id = $3)
           AND (scope NOT IN ('user','conversation') OR user_id = $4)
         ORDER BY importance DESC, updated_at DESC
         LIMIT $5`,
        [tenantId, scope ?? ['global', 'tenant', 'group', 'user'], groupId ?? -1, userId ?? -1, limit]);
      return rows;
    },
    listForAdmin: async (tenantId, { search, limit = 50, offset = 0 } = {}) => {
      const params = [tenantId];
      let cond = 'tenant_id = $1';
      if (search) {
        params.push(`%${search}%`);
        cond += ` AND content ILIKE $${params.length}`;
      }
      const { rows } = await pool.query(
        `SELECT * FROM memories WHERE ${cond}
         ORDER BY updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]);
      return rows;
    },
    /**
     * Semantic ranking: scope candidates ranked by
     * cosine similarity (when embeddings available) blended with importance
     * and recency. Ranking happens in JS over a bounded candidate set.
     */
    searchRanked: async (tenantId, { groupId, userId, scope, queryEmbedding = null, limit = 8, candidateLimit = 120 }) => {
      const { rows } = await pool.query(
        `SELECT * FROM memories
         WHERE tenant_id = $1 AND status = 'active'
           AND (expires_at IS NULL OR expires_at > now())
           AND (scope = ANY($2))
           AND (scope <> 'group' OR group_id = $3)
           AND (scope NOT IN ('user','conversation') OR user_id = $4)
         ORDER BY importance DESC, updated_at DESC
         LIMIT $5`,
        [tenantId, scope ?? ['global', 'tenant', 'group', 'user'], groupId ?? -1, userId ?? -1, candidateLimit]);
      const now = Date.now();
      const parse = (m) => {
        if (!m.embedding) return null;
        try { return typeof m.embedding === 'string' ? JSON.parse(m.embedding) : m.embedding; }
        catch { return null; }
      };
      const rank = (m) => {
        const ageDays = (now - new Date(m.updated_at).getTime()) / 86_400_000;
        const recency = Math.exp(-ageDays / 30);            // 30-day half-life-ish
        let sim = 0;
        if (queryEmbedding) {
          const emb = parse(m);
          if (emb) sim = cosineSimilarity(queryEmbedding, emb);
        }
        // semantic (0..1) weighted highest, then importance, then recency
        return sim * 0.6 + Number(m.importance) * 0.25 + recency * 0.15;
      };
      return rows
        .map((m) => {
          const emb = parse(m);
          return {
            ...m,
            _score: rank(m),
            _similarity: queryEmbedding && emb ? cosineSimilarity(queryEmbedding, emb) : null,
            _reason: queryEmbedding && emb ? 'semantic' : (emb ? 'no_query_embedding' : 'no_embedding'),
          };
        })
        .sort((a, b) => b._score - a._score)
        .slice(0, limit);
    },
    update: async (tenantId, id, patch) => {
      const allowed = ['content', 'importance', 'confidence', 'type', 'status', 'embedding'];
      const cols = Object.keys(patch).filter((k) => allowed.includes(k));
      if (cols.length === 0) return null;
      const vals = cols.map((c) => (c === 'embedding' ? JSON.stringify(patch[c]) : patch[c]));
      const sets = cols.map((c, i) => `${c} = $${i + 3}`).join(', ');
      const { rows } = await pool.query(
        `UPDATE memories SET ${sets}, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenantId, id, ...vals]);
      return rows[0] ?? null;
    },
    remove: async (tenantId, id) => {
      await pool.query(`DELETE FROM memories WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    },
    /** "این را یادت باشد" / "این را فراموش کن" style user commands. */
    forget: async (tenantId, userId, contentLike) => {
      await pool.query(
        `UPDATE memories SET status = 'disabled'
         WHERE tenant_id = $1 AND user_id = $2 AND content ILIKE $3`, [tenantId, userId, `%${contentLike}%`]);
    },
  };
}

/** Cosine similarity between two float arrays (returns 0 on length mismatch). */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function createBlacklistRepo(pool) {
  return {
    check: async (tenantId, kind, telegramId, groupRowId = null) => {
      const { rows } = await pool.query(
        `SELECT * FROM blacklists
         WHERE tenant_id = $1 AND kind = $2 AND telegram_id = $3
           AND (expires_at IS NULL OR expires_at > now())
           AND ($4::bigint IS NULL OR group_id IS NULL OR group_id = $4)
         ORDER BY created_at DESC LIMIT 1`, [tenantId, kind, telegramId, groupRowId]);
      return rows[0] ?? null;
    },
    add: async (tenantId, { kind, telegramId, groupId = null, mode = 'block', reason = '', internalNotes = '', expiresAt = null, createdBy = null }) => {
      const { rows } = await pool.query(
        `INSERT INTO blacklists (tenant_id, kind, telegram_id, group_id, mode, reason, internal_notes, expires_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [tenantId, kind, telegramId, groupId, mode, reason, internalNotes, expiresAt, createdBy]);
      return rows[0];
    },
    remove: async (tenantId, id) => {
      await pool.query(`DELETE FROM blacklists WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    },
    list: async (tenantId) =>
      (await pool.query(`SELECT * FROM blacklists WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId])).rows,
  };
}

export function createOpsRepo(pool) {
  return {
    // --- system settings (thresholds, templates, feature overrides) ---
    getSetting: async (key, fallback = null) => {
      const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = $1`, [key]);
      return rows[0]?.value ?? fallback;
    },
    setSetting: async (key, value, updatedBy = null) => {
      await pool.query(
        `INSERT INTO system_settings (key, value, updated_by) VALUES ($1,$2,$3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, JSON.stringify(value), updatedBy]);
      return value;
    },

    recordUsage: async (u) => {
      await pool.query(
        `INSERT INTO usage_records (tenant_id, group_id, user_id, provider_id, model_id, personality_id,
                                    request_kind, tokens_in, tokens_out, cost, latency_ms, status, error_code, ai_request_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [u.tenantId, u.groupId ?? null, u.userId ?? null, u.providerId ?? null, u.modelId ?? null,
         u.personalityId ?? null, u.requestKind ?? 'chat', u.tokensIn ?? 0, u.tokensOut ?? 0,
         u.cost ?? 0, u.latencyMs ?? null, u.status, u.errorCode ?? null, u.aiRequestId]);
    },
    usageSummary: async (tenantId, since) => {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS requests,
                COALESCE(sum(tokens_in),0)::bigint AS tokens_in,
                COALESCE(sum(tokens_out),0)::bigint AS tokens_out,
                COALESCE(sum(cost),0) AS cost,
                COALESCE(avg(latency_ms),0)::int AS avg_latency_ms,
                COALESCE(sum(CASE WHEN status = 'error' THEN 1 ELSE 0 END),0)::int AS errors
         FROM usage_records WHERE tenant_id = $1 AND created_at >= $2`, [tenantId, since]);
      return rows[0];
    },
    audit: async ({ tenantId, actorId, actorKind = 'admin', action, entityType, entityId, before, after, requestId, ip }) => {
      await pool.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, actor_kind, action, entity_type, entity_id, before, after, request_id, ip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [tenantId ?? null, actorId ?? null, actorKind, action, entityType ?? null, entityId ?? null,
         before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, requestId ?? null, ip ?? null]);
    },
    listAudit: async (tenantId, { limit = 50, offset = 0 } = {}) =>
      (await pool.query(
        `SELECT a.*, au.email AS actor_email
         FROM audit_logs a LEFT JOIN admin_users au ON au.id = a.actor_id
         WHERE a.tenant_id = $1 ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset])).rows,
    notify: async (tenantId, { level = 'info', title, body = '', channel = 'dashboard', dedupKey = null }) => {
      // Deduplicate: same dedup_key within 10 minutes is not re-inserted.
      if (dedupKey) {
        const { rows } = await pool.query(
          `SELECT 1 FROM notifications
           WHERE tenant_id = $1 AND dedup_key = $2 AND created_at > now() - interval '10 minutes' LIMIT 1`,
          [tenantId, dedupKey]);
        if (rows.length) return null;
      }
      const { rows } = await pool.query(
        `INSERT INTO notifications (tenant_id, level, title, body, channel, dedup_key)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [tenantId, level, title, body, channel, dedupKey]);
      return rows[0];
    },
    listNotifications: async (tenantId, { status, limit = 50 } = {}) => {
      const cond = status ? 'status = $2' : 'TRUE';
      return (await pool.query(
        `SELECT * FROM notifications WHERE tenant_id = $1 AND ${cond} ORDER BY created_at DESC LIMIT $${status ? 3 : 2}`,
        status ? [tenantId, status, limit] : [tenantId, limit])).rows;
    },

    // --- service health heartbeat ---
    heartbeat: async (service, startedAt = null) => {
      await pool.query(
        `INSERT INTO service_health (service, status, started_at, heartbeat_at)
         VALUES ($1,'online',$2, now())
         ON CONFLICT (service) DO UPDATE SET status = 'online', heartbeat_at = now(),
           started_at = COALESCE(service_health.started_at, EXCLUDED.started_at)`,
        [service, startedAt]);
    },
    markOffline: async (service) => {
      await pool.query(
        `INSERT INTO service_health (service, status) VALUES ($1,'offline')
         ON CONFLICT (service) DO UPDATE SET status = 'offline', heartbeat_at = now()`, [service]);
    },
    serviceHealth: async () =>
      (await pool.query(`SELECT * FROM service_health ORDER BY service`)).rows,

    saveResourceMetrics: async (m) => {
      await pool.query(
        `INSERT INTO resource_metrics (captured_at, cpu_percent, cpu_cores, load_avg, mem_total, mem_used,
                                       swap_total, swap_used, disks, net, processes, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [m.capturedAt, m.cpuPercent, m.cpuCores, m.loadAvg, m.memTotal, m.memUsed,
         m.swapTotal, m.swapUsed, m.disks ? JSON.stringify(m.disks) : null,
         m.net ? JSON.stringify(m.net) : null, m.processes ? JSON.stringify(m.processes) : null, m.source]);
    },
    latestResourceMetrics: async () => {
      const { rows } = await pool.query(
        `SELECT * FROM resource_metrics ORDER BY captured_at DESC LIMIT 1`);
      return rows[0] ?? null;
    },
  };
}

export function createModerationRepo(pool) {
  return {
    listRules: async (tenantId, groupId = null) => {
      const { rows } = await pool.query(
        `SELECT * FROM moderation_rules
         WHERE tenant_id = $1 AND enabled AND (group_id IS NULL OR group_id = $2)`,
        [tenantId, groupId]);
      return rows;
    },
    createRule: async (tenantId, r) => {
      const { rows } = await pool.query(
        `INSERT INTO moderation_rules (tenant_id, group_id, name, kind, pattern, config, severity, action)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [tenantId, r.groupId ?? null, r.name, r.kind, r.pattern ?? null,
         JSON.stringify(r.config ?? {}), r.severity ?? 'medium', r.action ?? 'warn']);
      return rows[0];
    },
    recordEvent: async (tenantId, e) => {
      const { rows } = await pool.query(
        `INSERT INTO moderation_events (tenant_id, group_id, user_id, rule_id, category, severity, action, detail)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [tenantId, e.groupId ?? null, e.userId ?? null, e.ruleId ?? null, e.category,
         e.severity, e.action, JSON.stringify(e.detail ?? {})]);
      return rows[0];
    },
    addWarning: async (tenantId, w) => {
      const { rows } = await pool.query(
        `INSERT INTO warnings (tenant_id, group_id, user_id, reason) VALUES ($1,$2,$3,$4) RETURNING *`,
        [tenantId, w.groupId ?? null, w.userId, w.reason ?? '']);
      const { rows: count } = await pool.query(
        `SELECT count(*)::int AS n FROM warnings
         WHERE tenant_id = $1 AND user_id = $2 AND group_id = $3
           AND created_at > now() - interval '24 hours'`,
        [tenantId, w.userId, w.groupId ?? null]);
      return { warning: rows[0], recentCount: count[0].n };
    },
  };
}
