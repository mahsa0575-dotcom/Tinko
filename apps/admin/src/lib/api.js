/**
 * API client with automatic access-token refresh.
 * Access token lives in memory; the refresh token is an HttpOnly cookie.
 */

let accessToken = null;
let onUnauthorized = null;

export function setToken(token) { accessToken = token; }
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

let refreshing = null;
async function refresh() {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      refreshing = null;
      if (!res.ok) throw new Error('unauthorized');
      const data = await res.json();
      accessToken = data.accessToken;
      return data.accessToken;
    })
    .catch((err) => { refreshing = null; throw err; });
  return refreshing;
}

export async function api(path, { method = 'GET', body } = {}) {
  const doFetch = () => fetch(`/api/v1${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  let res = await doFetch();
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    try {
      await refresh();
      res = await doFetch();
    } catch {
      onUnauthorized?.();
      throw new Error('نشست شما منقضی شده است. دوباره وارد شوید.');
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message ?? `Request failed (${res.status})`);
    err.code = data?.error?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}
