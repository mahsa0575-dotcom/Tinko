import { Errors } from '@botai/core';

/** AI configuration routes: providers, keys, models, profiles, personalities. */
export async function registerAiRoutes(fastify, { ctx }) {
  const { repos, router } = ctx;
  const guard = (perm) => ({ onRequest: [fastify.authenticate, fastify.requirePermission(perm)] });
  const tenantId = (req) => req.admin.tenantId;

  // ---------- Providers ----------
  fastify.get('/providers', guard('providers.read'), async (req) => repos.aiConfig.listProviders(tenantId(req)));

  fastify.post('/providers', guard('providers.write'), async (req) => {
    const b = req.body ?? {};
    if (!b.slug || !b.display_name || !b.kind) throw Errors.validation([{ message: 'slug, display_name and kind are required' }]);
    return repos.aiConfig.createProvider(tenantId(req), b);
  });

  fastify.patch('/providers/:id', guard('providers.write'), async (req) => {
    const updated = await repos.aiConfig.updateProvider(tenantId(req), req.params.id, req.body ?? {});
    if (!updated) throw Errors.notFound('Provider');
    return updated;
  });

  fastify.delete('/providers/:id', guard('providers.write'), async (req) => {
    await repos.aiConfig.deleteProvider(tenantId(req), req.params.id);
    return { ok: true };
  });

  // --- provider credentials ---
  fastify.post('/providers/:id/keys', guard('providers.write'), async (req) => {
    const secret = req.body?.secret;
    if (!secret) throw Errors.validation([{ message: 'secret required' }]);
    const provider = await repos.aiConfig.getProvider(tenantId(req), req.params.id);
    if (!provider) throw Errors.notFound('Provider');
    const key = await repos.aiConfig.addKey(provider.id, secret, req.body?.label ?? '');
    await ctx.repos.ops.audit({ tenantId: tenantId(req), actorId: req.admin.id, action: 'provider.key_added', entityType: 'provider', entityId: req.params.id, requestId: req.id, ip: req.ip });
    return key; // secret never returned
  });

  fastify.get('/providers/:id/keys', guard('providers.read'), async (req) => {
    const provider = await repos.aiConfig.getProvider(tenantId(req), req.params.id);
    if (!provider) throw Errors.notFound('Provider');
    return repos.aiConfig.listKeys(provider.id);
  });

  fastify.patch('/providers/:id/keys/:keyId', guard('providers.write'), async (req) => {
    const status = req.body?.status;
    if (!['active', 'disabled'].includes(status)) throw Errors.validation([{ message: 'status must be active|disabled' }]);
    const provider = await repos.aiConfig.getProvider(tenantId(req), req.params.id);
    if (!provider) throw Errors.notFound('Provider');
    const key = (await repos.aiConfig.listKeys(provider.id)).find((item) => String(item.id) === String(req.params.keyId));
    if (!key) throw Errors.notFound('Provider key');
    await repos.aiConfig.setKeyStatus(key.id, status);
    return { ok: true };
  });

  /** Test connection/auth/model without ever returning the secret. */
  fastify.post('/providers/:id/test', guard('providers.write'), async (req) => {
    const provider = await repos.aiConfig.getProvider(tenantId(req), req.params.id);
    if (!provider) throw Errors.notFound('Provider');
    const { model } = req.body ?? {};
    const key = await repos.aiConfig.getActiveKeySecret(provider.id);
    const result = await router.testProvider(provider, key?.secret, model);
    await repos.ops.audit({ tenantId: tenantId(req), actorId: req.admin.id, action: 'provider.tested', entityType: 'provider', entityId: provider.id, requestId: req.id });
    return { ok: result.ok, latencyMs: result.latencyMs, error: result.error ?? null };
  });

  // ---------- Models ----------
  fastify.get('/models', guard('models.read'), async (req) => {
    const all = await repos.aiConfig.allActiveModels();
    return all.filter((m) => m.tenant_id === tenantId(req));
  });

  fastify.post('/providers/:id/models', guard('models.write'), async (req) => {
    if (!req.body?.identifier) throw Errors.validation([{ message: 'identifier required' }]);
    const provider = await repos.aiConfig.getProvider(tenantId(req), req.params.id);
    if (!provider) throw Errors.notFound('Provider');
    return repos.aiConfig.upsertModel(provider.id, req.body);
  });

  // ---------- Logical profiles ----------
  fastify.get('/model-profiles', guard('models.read'), async (req) => repos.aiConfig.listProfiles(tenantId(req)));

  fastify.put('/model-profiles/:key', guard('models.write'), async (req) => {
    const b = req.body ?? {};
    const models = [...new Set((b.models ?? []).map(Number))];
    if (models.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw Errors.validation([{ message: 'models must contain positive model IDs' }]);
    }
    const allowedModelIds = new Set((await repos.aiConfig.allActiveModels())
      .filter((model) => model.tenant_id === tenantId(req)).map((model) => model.id));
    if (models.some((id) => !allowedModelIds.has(id))) {
      throw Errors.validation([{ message: 'a model does not belong to this tenant or is inactive' }]);
    }
    await repos.aiConfig.saveProfile(tenantId(req), { key: req.params.key, name: b.name ?? req.params.key, description: b.description, models });
    return { ok: true };
  });

  // ---------- Personalities ----------
  fastify.get('/personalities', guard('personalities.read'), async (req) => repos.aiConfig.listPersonalities(tenantId(req)));

  fastify.get('/personalities/:id', guard('personalities.read'), async (req) => {
    const p = await repos.aiConfig.getPersonality(tenantId(req), req.params.id);
    if (!p) throw Errors.notFound('Personality');
    return p;
  });

  fastify.post('/personalities', guard('personalities.write'), async (req) => {
    const b = req.body ?? {};
    if (!b.slug || !b.display_name) throw Errors.validation([{ message: 'slug and display_name required' }]);
    const p = await repos.aiConfig.createPersonality(tenantId(req), b, req.admin.id);
    await repos.ops.audit({ tenantId: tenantId(req), actorId: req.admin.id, action: 'personality.created', entityType: 'personality', entityId: p.id, after: { slug: p.slug }, requestId: req.id });
    return p;
  });

  fastify.patch('/personalities/:id', guard('personalities.write'), async (req) => {
    const before = await repos.aiConfig.getPersonality(tenantId(req), req.params.id);
    if (!before) throw Errors.notFound('Personality');
    const { __summary, ...patch } = req.body ?? {};
    const updated = await repos.aiConfig.updatePersonality(tenantId(req), req.params.id, patch, req.admin.id, __summary);
    await repos.ops.audit({ tenantId: tenantId(req), actorId: req.admin.id, action: 'personality.updated', entityType: 'personality', entityId: Number(req.params.id), before: { system_prompt: before.system_prompt }, after: { system_prompt: updated.system_prompt }, requestId: req.id });
    return updated;
  });

  fastify.get('/personalities/:id/versions', guard('personalities.read'), async (req) => {
    const personality = await repos.aiConfig.getPersonality(tenantId(req), req.params.id);
    if (!personality) throw Errors.notFound('Personality');
    return repos.aiConfig.listPersonalityVersions(personality.id);
  });

  /** Live test chat (Personality Studio) — routed like production but flagged as test. */
  fastify.post('/personalities/test-chat', guard('personalities.write'), async (req) => {
    const { messages = [], profileKey, modelId, personalityId, temperature, maxTokens } = req.body ?? {};
    let finalMessages = messages;
    if (personalityId) {
      const p = await repos.aiConfig.getPersonality(tenantId(req), personalityId);
      if (p?.system_prompt) finalMessages = [{ role: 'system', content: p.system_prompt }, ...messages];
    }
    const result = await router.chat(finalMessages, {
      tenantId: tenantId(req), profileKey, explicitModelId: modelId ?? null,
      temperature, maxTokens: maxTokens ?? 1024,
      requestKind: 'test', userId: req.admin.id,
    });
    return {
      content: result.content, usage: result.usage, latencyMs: result.latencyMs,
      routed: { ...result.routed, raw: undefined },
    };
  });
}
