import { Errors } from '@botai/core';

/** AI configuration routes: providers, keys, models, profiles, personalities. */
export async function registerAiRoutes(fastify, { ctx }) {
  const { repos, router } = ctx;
  const guard = (perm) => ({ onRequest: [fastify.authenticate, fastify.requirePermission(perm)] });

  // ---------- Providers ----------
  fastify.get('/providers', guard('providers.read'), async () => repos.aiConfig.listProviders(1));

  fastify.post('/providers', guard('providers.write'), async (req) => {
    const b = req.body ?? {};
    if (!b.slug || !b.display_name || !b.kind) throw Errors.validation([{ message: 'slug, display_name and kind are required' }]);
    return repos.aiConfig.createProvider(1, b);
  });

  fastify.patch('/providers/:id', guard('providers.write'), async (req) => {
    const updated = await repos.aiConfig.updateProvider(1, req.params.id, req.body ?? {});
    if (!updated) throw Errors.notFound('Provider');
    return updated;
  });

  fastify.delete('/providers/:id', guard('providers.write'), async (req) => {
    await repos.aiConfig.deleteProvider(1, req.params.id);
    return { ok: true };
  });

  // --- provider credentials ---
  fastify.post('/providers/:id/keys', guard('providers.write'), async (req) => {
    const secret = req.body?.secret;
    if (!secret) throw Errors.validation([{ message: 'secret required' }]);
    const key = await repos.aiConfig.addKey(req.params.id, secret, req.body?.label ?? '');
    await ctx.repos.ops.audit({ tenantId: 1, actorId: req.admin.id, action: 'provider.key_added', entityType: 'provider', entityId: req.params.id, requestId: req.id, ip: req.ip });
    return key; // secret never returned
  });

  fastify.get('/providers/:id/keys', guard('providers.read'), async (req) => repos.aiConfig.listKeys(req.params.id));

  fastify.patch('/providers/:id/keys/:keyId', guard('providers.write'), async (req) => {
    const status = req.body?.status;
    if (!['active', 'disabled'].includes(status)) throw Errors.validation([{ message: 'status must be active|disabled' }]);
    await repos.aiConfig.setKeyStatus(req.params.keyId, status);
    return { ok: true };
  });

  /** Test connection/auth/model without ever returning the secret. */
  fastify.post('/providers/:id/test', guard('providers.write'), async (req) => {
    const provider = await repos.aiConfig.getProvider(1, req.params.id);
    if (!provider) throw Errors.notFound('Provider');
    const { model } = req.body ?? {};
    const key = await repos.aiConfig.getActiveKeySecret(provider.id);
    const result = await router.testProvider(provider, key?.secret, model);
    await repos.ops.audit({ tenantId: 1, actorId: req.admin.id, action: 'provider.tested', entityType: 'provider', entityId: provider.id, requestId: req.id });
    return { ok: result.ok, latencyMs: result.latencyMs, error: result.error ?? null };
  });

  // ---------- Models ----------
  fastify.get('/models', guard('models.read'), async () => {
    const all = await repos.aiConfig.allActiveModels();
    return all.filter((m) => m.tenant_id === 1);
  });

  fastify.post('/providers/:id/models', guard('models.write'), async (req) => {
    if (!req.body?.identifier) throw Errors.validation([{ message: 'identifier required' }]);
    return repos.aiConfig.upsertModel(req.params.id, req.body);
  });

  // ---------- Logical profiles ----------
  fastify.get('/model-profiles', guard('models.read'), async () => repos.aiConfig.listProfiles(1));

  fastify.put('/model-profiles/:key', guard('models.write'), async (req) => {
    const b = req.body ?? {};
    await repos.aiConfig.saveProfile(1, { key: req.params.key, name: b.name ?? req.params.key, description: b.description, models: b.models ?? [] });
    return { ok: true };
  });

  // ---------- Personalities ----------
  fastify.get('/personalities', guard('personalities.read'), async () => repos.aiConfig.listPersonalities(1));

  fastify.get('/personalities/:id', guard('personalities.read'), async (req) => {
    const p = await repos.aiConfig.getPersonality(1, req.params.id);
    if (!p) throw Errors.notFound('Personality');
    return p;
  });

  fastify.post('/personalities', guard('personalities.write'), async (req) => {
    const b = req.body ?? {};
    if (!b.slug || !b.display_name) throw Errors.validation([{ message: 'slug and display_name required' }]);
    const p = await repos.aiConfig.createPersonality(1, b, req.admin.id);
    await repos.ops.audit({ tenantId: 1, actorId: req.admin.id, action: 'personality.created', entityType: 'personality', entityId: p.id, after: { slug: p.slug }, requestId: req.id });
    return p;
  });

  fastify.patch('/personalities/:id', guard('personalities.write'), async (req) => {
    const before = await repos.aiConfig.getPersonality(1, req.params.id);
    if (!before) throw Errors.notFound('Personality');
    const { __summary, ...patch } = req.body ?? {};
    const updated = await repos.aiConfig.updatePersonality(1, req.params.id, patch, req.admin.id);
    await repos.ops.audit({ tenantId: 1, actorId: req.admin.id, action: 'personality.updated', entityType: 'personality', entityId: Number(req.params.id), before: { system_prompt: before.system_prompt }, after: { system_prompt: updated.system_prompt }, requestId: req.id });
    return updated;
  });

  fastify.get('/personalities/:id/versions', guard('personalities.read'), async (req) =>
    repos.aiConfig.listPersonalityVersions(req.params.id));

  /** Live test chat (Personality Studio) — routed like production but flagged as test. */
  fastify.post('/personalities/test-chat', guard('personalities.write'), async (req) => {
    const { messages = [], profileKey, modelId, personalityId, temperature, maxTokens } = req.body ?? {};
    let finalMessages = messages;
    if (personalityId) {
      const p = await repos.aiConfig.getPersonality(1, personalityId);
      if (p?.system_prompt) finalMessages = [{ role: 'system', content: p.system_prompt }, ...messages];
    }
    const result = await router.chat(finalMessages, {
      tenantId: 1, profileKey, explicitModelId: modelId ?? null,
      temperature, maxTokens: maxTokens ?? 1024,
      requestKind: 'test', userId: req.admin.id,
    });
    return {
      content: result.content, usage: result.usage, latencyMs: result.latencyMs,
      routed: { ...result.routed, raw: undefined },
    };
  });
}
