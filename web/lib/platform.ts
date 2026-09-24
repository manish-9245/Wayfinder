/** Typed client for the platform API (proxied /api/* -> gateway /v1/*).
 *
 *  Browser auth rides on the SuperTokens session cookies (fetch uses
 *  credentials:include; supertokens-web-js adds rid/anti-csrf headers).
 *  A saved `wf_…` service key from localStorage is attached as Bearer when
 *  present (set by Dashboard "Use in console"). Anonymous works on open dev
 *  gateways; configured gateways 401 without credentials.
 */

export type GetToken = () => Promise<string | null>;

export interface Me {
  id: number; email: string; role: string; plan: string;
  quota_monthly: number | null; quota_used: number; rate_per_min: number;
}
export interface ApiKeyRow {
  id: number; name: string; prefix: string; is_active: boolean;
  request_count: number; last_used_at: string | null; created_at: string | null;
}
export interface LogRow {
  id: number; created_at: string | null; user_id: number | null; email: string;
  key_prefix: string | null; policy: string; verdict: string; confidence: number | null;
  latency_ms: number; cache_hit: boolean; blocked: boolean; error: boolean;
  status_code: number; ip: string; state_preview: string;
}

async function bearer(getToken?: GetToken): Promise<string | null> {
  try {
    const t = getToken ? await getToken() : null;
    if (t) return t;
  } catch { /* signed out — fall through to saved key */ }
  try {
    return localStorage.getItem("wayfinder.key");
  } catch {
    return null;
  }
}

async function call<T>(path: string, init: RequestInit = {}, getToken?: GetToken): Promise<T> {
  const token = await bearer(getToken);
  const r = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (r.status === 204) return undefined as T;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any).detail || `request failed (${r.status})`);
  return j as T;
}

const get =
  <T>(path: string, getToken?: GetToken) =>
    call<T>(path, { method: "GET" }, getToken);

export const platform = {
  me: (t?: GetToken) => get<Me>("/v1/me", t),
  usage: (t?: GetToken, days = 30) => get<any>(`/v1/me/usage?days=${days}`, t),
  logs: (t?: GetToken, q = "") => get<{ total: number; logs: LogRow }>(`/v1/me/logs${q}`, t) as unknown as Promise<{ total: number; logs: LogRow[] }>,
  createKey: (name: string, t?: GetToken) =>
    call<ApiKeyRow & { key: string }>("/v1/keys", { method: "POST", body: JSON.stringify({ name }) }, t),
  listKeys: (t?: GetToken) => get<ApiKeyRow[]>("/v1/keys", t),
  revokeKey: (prefix: string, t?: GetToken) =>
    call<void>(`/v1/keys/${prefix}`, { method: "DELETE" }, t),
  adminOverview: (t?: GetToken, days = 30) => get<any>(`/v1/admin/overview?days=${days}`, t),
  adminUsers: (t?: GetToken, q = "") => get<any>(`/v1/admin/users${q}`, t),
  patchUser: (id: number, patch: Record<string, any>, t?: GetToken) =>
    call<any>(`/v1/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, t),
  deleteUser: (id: number, t?: GetToken) =>
    call<void>(`/v1/admin/users/${id}`, { method: "DELETE" }, t),
  adminKeys: (t?: GetToken, q = "") => get<any>(`/v1/admin/keys${q}`, t),
  adminRevokeKey: (prefix: string, t?: GetToken) =>
    call<void>(`/v1/admin/keys/${prefix}`, { method: "DELETE" }, t),
  adminLogs: (t?: GetToken, q = "") => get<any>(`/v1/admin/logs${q}`, t),
  adminSystem: (t?: GetToken) => get<any>("/v1/admin/system", t),
};

export function saveKeyForConsole(raw: string | null) {
  try {
    if (raw) localStorage.setItem("wayfinder.key", raw);
    else localStorage.removeItem("wayfinder.key");
  } catch { /* private mode */ }
}
