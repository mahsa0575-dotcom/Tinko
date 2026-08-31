/**
 * Memory extraction (spec §26–27): reviews recent conversation turns and
 * extracts durable, scoped memories using a cheap AI model. Output is strict
 * JSON; every failure is contained and logged, never breaking the pipeline.
 */
export async function runMemoryExtraction(ctx, job) {
  const { repos, router, logger } = ctx;
  const { conversationId, tenantId = 1, groupId = null, userId = null, turns } = job.data;
  if (!Array.isArray(turns) || turns.length === 0) return { extracted: 0 };

  const system = [
    'یک موتور استخراج حافظه هستی. گفتگوی زیر را بررسی کن و تنها اطلاعات ماندگار و مفید را استخراج کن.',
    'موارد زیر را ذخیره نکن: رمزها، کلیدها، اطلاعات موقتی و بی‌اهمیت، جزئیات عادی روزمره.',
    'خروجی فقط و فقط JSON معتبر با این ساختار باشد و هیچ متن دیگری ننویس:',
    '[{"type":"fact|user_preference|group_rule","content":"جمله‌ی کوتاه و ماندگار","importance":0.5,"confidence":0.8}]',
    'حداکثر ۳ مورد. اگر چیزی برای ذخیره نبود: []',
  ].join('\n');

  let raw;
  try {
    const result = await router.chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: turns.map((t) => `${t.role === 'assistant' ? 'دستیار' : 'کاربر'}: ${t.content}`).join('\n') },
      ],
      { tenantId, profileKey: 'fast', requestKind: 'extraction', userId, groupId, maxTokens: 400, temperature: 0 });
    raw = result.content;
  } catch (err) {
    logger.warn('memory extraction AI call failed', { kind: err.kind, error: err.message });
    return { extracted: 0, error: err.kind };
  }

  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return { extracted: 0 };
  let items;
  try { items = JSON.parse(match[0]); } catch { return { extracted: 0 }; }
  if (!Array.isArray(items)) return { extracted: 0 };

  let created = 0;
  for (const item of items.slice(0, 3)) {
    if (!item?.content || typeof item.content !== 'string') continue;
    const memory = await repos.memory.create(tenantId, {
      scope: groupId ? 'group' : 'user',
      groupId, userId,
      type: ['fact', 'user_preference', 'group_rule'].includes(item.type) ? item.type : 'fact',
      content: String(item.content).slice(0, 500),
      importance: Math.min(1, Math.max(0, Number(item.importance) || 0.5)),
      confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.8)),
      source: 'extraction',
    });
    // Attach embedding asynchronously; failures are non-fatal.
    try {
      const embedding = await router.embed(memory.content, { tenantId });
      if (embedding) await repos.memory.update(tenantId, memory.id, { embedding });
    } catch (err) {
      logger.debug('memory embedding skipped', { error: err.message });
    }
    created += 1;
  }
  logger.info('memory extraction done', { conversationId, created });
  return { extracted: created };
}

/** Backfill embeddings for memories missing them (bounded per run). */
export async function runMemoryEmbeddingBackfill(ctx) {
  const { pool, repos, router, logger } = ctx;
  const { rows } = await pool.query(
    `SELECT id, content, tenant_id FROM memories
     WHERE embedding IS NULL AND status = 'active'
     ORDER BY updated_at DESC LIMIT 25`);
  let updated = 0;
  for (const row of rows) {
    try {
      const embedding = await router.embed(row.content, { tenantId: row.tenant_id });
      if (embedding) { await repos.memory.update(row.tenant_id, row.id, { embedding }); updated += 1; }
    } catch (err) {
      logger.debug('backfill embed failed', { id: row.id, error: err.message });
      break; // likely no embedding model; don't hammer
    }
  }
  return { updated, remaining: rows.length - updated };
}
