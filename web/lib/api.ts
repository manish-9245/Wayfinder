export type Answers = Record<string, any>;
export interface DecideResult {
  answers: Answers;
  routing?: { model?: string; reason?: string };
  verdict?: { verdict: string; confidence?: number; trigger?: string };
  thresholds?: Record<string, number>;
  cache_hit?: boolean;
  policy?: string;
  usage?: Record<string, number>;
}

import { redirectToLogin } from "@/lib/login-redirect";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let saved: string | null = null;
  try { saved = localStorage.getItem("wayfinder.key"); } catch { /* ssr/private */ }
  const headers: Record<string, string> = { "content-type": "application/json", ...(init?.headers as any || {}) };
  if (saved && !headers.authorization) headers.authorization = `Bearer ${saved}`;
  const r = await fetch(path, { ...init, headers });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) {
    redirectToLogin(
      (j as any).detail || "Sign-in required — log in or add an API key from the dashboard to continue."
    );
  }
  if (!r.ok) throw new Error((j as any).detail || `request failed (${r.status})`);
  return j as T;
}

export const api = {
  health: () => req<{ status: string; policies: string[]; cache_entries: number }>("/api/health"),
  metrics: () => req<Record<string, number>>("/api/metrics"),
  policies: () => req<Record<string, { description: string; questions: string[]; auto_act_above: number; escalate_below?: number }>>("/api/policies"),
  policiesFull: () => req<Record<string, { description: string; questions: Record<string, any>; auto_act_above: number; escalate_below?: number }>>("/api/policies?full=1"),
  decide: (policy: string, state: unknown, opts: Record<string, any> = {}) =>
    req<DecideResult>(`/api/v1/decide/${policy}`, { method: "POST", body: JSON.stringify({ state, ...opts }) }),
  batch: (states: unknown[], policy: string) =>
    req<{ count: number; results: DecideResult[] }>("/api/predict/batch", { method: "POST", body: JSON.stringify({ states, policy }) }),
  doc: async (name: string) => {
    const r = await fetch(`/api/docs-files/${name}`);
    if (!r.ok) throw new Error(`doc ${name} not found`);
    return r.text();
  },
};

import { toast as sonner } from "sonner";

export function toast(msg: string) {
  try {
    sonner.error(msg);
    return;
  } catch {
    /* sonner unavailable (SSR) — fall back to the legacy toast node */
  }
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  window.clearTimeout((t as any)._h);
  (t as any)._h = window.setTimeout(() => t.classList.remove("show"), 4000);
}

export function verdictOf(res: DecideResult): string {
  if (res.verdict?.verdict) return res.verdict.verdict;
  let b = 0;
  for (const a of Object.values(res.answers || {})) {
    const s = (a as any).noul ?? (a as any).confidence ?? 0;
    if (s > b) b = s;
  }
  return b >= 0.85 ? "act" : b < 0.6 ? "escalate" : "review";
}

export function topOf(res: DecideResult): string {
  for (const [k, a] of Object.entries(res.answers || {})) {
    if ((a as any).choice) return `${k} → ${(a as any).choice}`;
    if ((a as any).noul != null) return `${k} ${(((a as any).noul as number) * 100).toFixed(0)}%`;
  }
  return "n/a";
}
