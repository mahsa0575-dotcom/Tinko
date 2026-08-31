/** AI configuration: providers, keys, models, logical profiles, personalities. */

export function createAiConfigRepo(pool, { encrypt, decrypt, mask }) {
  return {
    // --- providers ---
    listProviders: async (tenantId) =>
      (await pool.query(
        `SELECT p.*, array_agg(pk.id) FILTER (WHERE pk.id IS NOT NULL) AS key_ids
         FROM providers p LEFT JOIN provider_keys pk ON pk.provider_id = p.id
         WHERE p.tenant_id = $1 GROUP BY p.id ORDER BY p.created_at`, [tenantId])).rows,
    getProvider: async (tenantId, id) => {
      const { rows } = await pool.query(
        `SELECT * FROM providers WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      return rows[0] ?? null;
    },
    createProvider: async (tenantId, data) => {
      const { rows } = await pool.query(
        `INSERT INTO providers (tenant_id, slug, display_name, kind, base_url, config, timeout_ms, max_retries)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [tenantId, data.slug, data.display_name, data.kind, data.base_url ?? null,
         JSON.stringify(data.config ?? {}), data.timeout_ms ?? 60000, data.max_retries ?? 2]);
      return rows[0];
    },
    updateProvider: async (tenantId, id, patch) => {
      const allowed = ['display_name', 'base_url', 'config', 'timeout_ms', 'max_retries', 'status'];
      const cols = Object.keys(patch).filter((k) => allowed.includes(k));
      if (cols.length === 0) return null;
      const sets = cols.map((c, i) => `${c} = $${i + 3}`).join(', ');
      const { rows } = await pool.query(
        `UPDATE providers SET ${sets}, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenantId, id, ...cols.map((c) => patch[c])]);
      return rows[0] ?? null;
    },
    deleteProvider: async (tenantId, id) => {
      await pool.query(`DELETE FROM providers WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    },

    // --- keys ---
    addKey: async (providerId, secret, label = '') => {
      const { rows } = await pool.query(
        `INSERT INTO provider_keys (provider_id, label, secret_enc) VALUES ($1,$2,$3)
         RETURNING id, provider_id, label, status, created_at`,
        [providerId, label, encrypt(secret)]);
      return rows[0];
    },
    listKeys: async (providerId) =>
      (await pool.query(
        `SELECT id, label, status, last_error, last_used_at, created_at
         FROM provider_keys WHERE provider_id = $1 ORDER BY id`, [providerId])).rows,
    getActiveKeySecret: async (providerId) => {
      // Least-recently-used rotation across active keys.
      const { rows } = await pool.query(
        `SELECT id, secret_enc FROM provider_keys
         WHERE provider_id = $1 AND status = 'active'
         ORDER BY last_used_at NULLS FIRST, id LIMIT 1`, [providerId]);
      if (!rows[0]) return null;
      await pool.query(`UPDATE provider_keys SET last_used_at = now() WHERE id = $1`, [rows[0].id]);
      return { id: rows[0].id, secret: decrypt(rows[0].secret_enc) };
    },
    setKeyStatus: async (keyId, status, lastError = null) => {
      await pool.query(
        `UPDATE provider_keys SET status = $2, last_error = $3 WHERE id = $1`, [keyId, status, lastError]);
    },

    // --- models ---
    listModels: async (providerId) =>
      (await pool.query(
        `SELECT * FROM models WHERE provider_id = $1 ORDER BY priority, identifier`, [providerId])).rows,
    allActiveModels: async () =>
      (await pool.query(
        `SELECT m.*, p.tenant_id, p.slug AS provider_slug, p.kind AS provider_kind, p.health AS provider_health,
                p.base_url, p.config AS provider_config, p.timeout_ms, p.max_retries
         FROM models m JOIN providers p ON p.id = m.provider_id
         WHERE m.status = 'active' AND p.status = 'active'
         ORDER BY m.priority`)).rows,
    upsertModel: async (providerId, m) => {
      const { rows } = await pool.query(
        `INSERT INTO models (provider_id, identifier, display_name, description, context_window, max_output,
                             input_price, output_price, capabilities, aliases, priority, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (provider_id, identifier) DO UPDATE SET
           display_name = EXCLUDED.display_name, description = EXCLUDED.description,
           context_window = EXCLUDED.context_window, max_output = EXCLUDED.max_output,
           input_price = EXCLUDED.input_price, output_price = EXCLUDED.output_price,
           capabilities = EXCLUDED.capabilities, aliases = EXCLUDED.aliases,
           priority = EXCLUDED.priority, status = EXCLUDED.status
         RETURNING *`,
        [providerId, m.identifier, m.display_name ?? m.identifier, m.description ?? '',
         m.context_window ?? null, m.max_output ?? null, m.input_price ?? null, m.output_price ?? null,
         m.capabilities ?? ['chat'], m.aliases ?? [], m.priority ?? 100, m.status ?? 'active']);
      return rows[0];
    },

    // --- logical profiles ---
    listProfiles: async (tenantId) =>
      (await pool.query(
        `SELECT mp.*, json_agg(json_build_object('model_id', mpm.model_id, 'position', mpm.position)
                ORDER BY mpm.position) AS models
         FROM model_profiles mp LEFT JOIN model_profile_models mpm ON mpm.profile_id = mp.id
         WHERE mp.tenant_id = $1 GROUP BY mp.id ORDER BY mp.key`, [tenantId])).rows,
    saveProfile: async (tenantId, { key, name, description = '', models = [] }) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO model_profiles (tenant_id, key, name, description)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (tenant_id, key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
           RETURNING id`, [tenantId, key, name, description]);
        const profileId = rows[0].id;
        await client.query(`DELETE FROM model_profile_models WHERE profile_id = $1`, [profileId]);
        for (const [i, modelId] of models.entries()) {
          await client.query(
            `INSERT INTO model_profile_models (profile_id, model_id, position) VALUES ($1,$2,$3)
             ON CONFLICT DO NOTHING`, [profileId, modelId, i]);
        }
        await client.query('COMMIT');
        return profileId;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    // --- personalities ---
    listPersonalities: async (tenantId) =>
      (await pool.query(
        `SELECT id, slug, display_name, description, model_profile_key, is_default, status, current_version, created_at, updated_at
         FROM personalities WHERE tenant_id = $1 ORDER BY created_at`, [tenantId])).rows,
    getPersonality: async (tenantId, id) => {
      const { rows } = await pool.query(
        `SELECT * FROM personalities WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      return rows[0] ?? null;
    },
    getDefaultPersonality: async (tenantId) => {
      const { rows } = await pool.query(
        `SELECT * FROM personalities WHERE tenant_id = $1 AND is_default = true AND status = 'active' LIMIT 1`,
        [tenantId]);
      return rows[0] ?? null;
    },
    createPersonality: async (tenantId, data, authorId = null) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO personalities (tenant_id, slug, display_name, description, system_prompt, config, model_profile_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [tenantId, data.slug, data.display_name, data.description ?? '', data.system_prompt ?? '',
           JSON.stringify(data.config ?? {}), data.model_profile_key ?? null]);
        const p = rows[0];
        await client.query(
          `INSERT INTO personality_versions (personality_id, version, author_id, summary, snapshot)
           VALUES ($1, 1, $2, $3, $4)`,
          [p.id, authorId, 'initial', JSON.stringify(p)]);
        await client.query('COMMIT');
        return p;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    updatePersonality: async (tenantId, id, patch, authorId = null) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const cur = (await client.query(
          `SELECT * FROM personalities WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [tenantId, id])).rows[0];
        if (!cur) { await client.query('ROLLBACK'); return null; }
        const next = { ...cur, ...patch, updated_at: new Date() };
        const version = cur.current_version + 1;
        const { rows } = await client.query(
          `UPDATE personalities SET display_name = $3, description = $4, system_prompt = $5,
                  config = $6, model_profile_key = $7, status = $8, current_version = $9, updated_at = now()
           WHERE id = $1 AND tenant_id = $2 RETURNING *`,
          [id, tenantId, next.display_name, next.description, next.system_prompt,
           JSON.stringify(typeof next.config === 'string' ? JSON.parse(next.config) : next.config),
           next.model_profile_key, next.status, version]);
        await client.query(
          `INSERT INTO personality_versions (personality_id, version, author_id, summary, snapshot)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, version, authorId, patch.__summary ?? 'update', JSON.stringify(rows[0])]);
        await client.query('COMMIT');
        return rows[0];
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    listPersonalityVersions: async (personalityId) =>
      (await pool.query(
        `SELECT id, version, author_id, summary, created_at
         FROM personality_versions WHERE personality_id = $1 ORDER BY version DESC`,
        [personalityId])).rows,

    // expose crypto helpers for API masking
    maskSecret: mask,
  };
}
