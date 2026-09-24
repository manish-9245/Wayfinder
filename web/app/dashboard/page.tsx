"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/api";
import { saveKeyForConsole } from "@/lib/platform";
import { DailyChart, Kpis, LogsTable, PolicyBars, RequireAuth, platform, useAsync, usePlatform } from "@/components/dash";

const PAGE = 25;

export default function DashboardPage() {
  const { getToken } = usePlatform();
  const me = useAsync(() => platform.me(getToken));
  const usage = useAsync(() => platform.usage(getToken), [me.data?.id]);
  const keys = useAsync(() => platform.listKeys(getToken));

  const [keyName, setKeyName] = useState("default");
  const [freshKey, setFreshKey] = useState("");
  const [busy, setBusy] = useState(false);

  const [policy, setPolicy] = useState("");
  const [verdict, setVerdict] = useState("");
  const [search, setSearch] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [page, setPage] = useState(0);
  const logQuery = `?policy=${encodeURIComponent(policy)}&verdict=${encodeURIComponent(verdict)}&search=${encodeURIComponent(search)}${errorsOnly ? "&errors_only=true" : ""}&limit=${PAGE}&offset=${page * PAGE}`;
  const logs = useAsync(() => platform.logs(getToken, logQuery), [policy, verdict, search, errorsOnly, page, keys.data]);

  if (me.err)
    return (
      <div className="chapter narrow">
        <h1 className="display">Dashboard unavailable</h1>
        <p className="mut">{me.err}. The gateway may be offline or sign-in is required.</p>
        <p><Link className="ghost btn-link" href="/sign-in">Sign in</Link></p>
      </div>
    );

  const t = usage.data?.totals;
  const quota = usage.data?.quota_monthly;
  const quotaUsed = usage.data?.quota_used ?? 0;

  const createKey = async () => {
    setBusy(true);
    try {
      const k = await platform.createKey(keyName.trim() || "default", getToken);
      setFreshKey(k.key);
      saveKeyForConsole(k.key);
      keys.reload();
      toast("Key created — copied to console auth");
    } catch (e: any) { toast(e.message); }
    finally { setBusy(false); }
  };

  const revoke = async (prefix: string) => {
    if (!confirm(`Revoke ${prefix}? Clients using it get 401 immediately.`)) return;
    try { await platform.revokeKey(prefix, getToken); keys.reload(); toast("Key revoked"); }
    catch (e: any) { toast(e.message); }
  };

  return (
    <RequireAuth>
    <>
      <div className="hero">
        <h1>Dashboard <span className="thin">· {me.data ? `${me.data.email} · ${me.data.plan}` : "loading…"}</span></h1>
        <p>Keys, usage, and request logs for your account. New here? <Link href="/console">Try the console</Link>, then grab a key below.</p>
      </div>

      {t && (
        <Kpis items={[
          { k: "Requests · 30d", n: String(t.requests) },
          { k: "Cache hit rate", n: `${(t.cache_hit_rate * 100).toFixed(1)}%` },
          { k: "Blocks", n: String(t.blocks) },
          { k: "Avg latency", n: `${t.avg_latency_ms}ms` },
          { k: "p95 latency", n: `${t.p95_latency_ms}ms` },
        ]} />
      )}

      <div className="card">
        <h3>Monthly quota</h3>
        {quota == null
          ? <p className="mut">Unlimited on your plan ({me.data?.rate_per_min === 0 ? "no" : me.data?.rate_per_min}/min rate limit).</p>
          : <>
            <div className="prow"><code>{quotaUsed} / {quota}</code><span className="pct">{((quotaUsed / Math.max(1, quota)) * 100).toFixed(0)}%</span></div>
            <div className="bar"><div className="fill" style={{ width: `${Math.min(100, (quotaUsed / Math.max(1, quota)) * 100)}%` }} /></div>
          </>}
      </div>

      <div className="dash-grid">
        {usage.data && <DailyChart daily={usage.data.daily} />}
        {usage.data && <PolicyBars rows={usage.data.by_policy} />}
      </div>

      <div className="card">
        <h3>API keys</h3>
        <p className="mut">Service keys start with <code>wf_</code>. The raw secret is shown once — store it in an env var. Creating a key also enables it in this browser&apos;s console.</p>
        {freshKey && (
          <div className="copybox" role="status">
            <span>{freshKey}</span>
            <button type="button" className="mini" onClick={() => { navigator.clipboard?.writeText(freshKey); toast("Copied"); }}>Copy</button>
            <button type="button" className="mini" onClick={() => setFreshKey("")}>Dismiss</button>
          </div>
        )}
        <div className="toolbar">
          <input type="text" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name" aria-label="Key name" />
          <button type="button" className="primary" onClick={createKey} disabled={busy}>{busy ? "Creating…" : "Create key"}</button>
        </div>
        {(keys.data?.length ?? 0) > 0 && (
          <div className="res-wrap">
            <table className="res">
              <thead><tr><th>Name</th><th>Prefix</th><th>Calls</th><th>Last used</th><th></th></tr></thead>
              <tbody>
                {keys.data!.map((k) => (
                  <tr key={k.prefix}>
                    <td>{k.name}</td>
                    <td className="mono">{k.prefix}{k.is_active ? "" : " (revoked)"}</td>
                    <td className="mono">{k.request_count}</td>
                    <td className="mono">{k.last_used_at ? new Date(k.last_used_at + "Z").toLocaleString() : "never"}</td>
                    <td>
                      {k.is_active && <>
                        <button type="button" className="mini" onClick={() => {
                          const raw = prompt("Paste the raw wf_… secret to enable it in this browser's console:");
                          if (raw) { saveKeyForConsole(raw); toast("Console will use this key"); }
                        }}>Use in console</button>{" "}
                        <button type="button" className="danger" onClick={() => revoke(k.prefix)}>Revoke</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Request logs</h3>
        <div className="toolbar">
          <select className="inline" value={policy} onChange={(e) => { setPolicy(e.target.value); setPage(0); }} aria-label="Policy filter">
            <option value="">All policies</option>
            <option value="llm_firewall">llm_firewall</option>
            <option value="support_inbound">support_inbound</option>
            <option value="model_router">model_router</option>
            <option value="content_safety">content_safety</option>
          </select>
          <select className="inline" value={verdict} onChange={(e) => { setVerdict(e.target.value); setPage(0); }} aria-label="Verdict filter">
            <option value="">All verdicts</option>
            <option value="act">act</option><option value="allow">allow</option>
            <option value="review">review</option><option value="escalate">escalate</option>
            <option value="block">block</option>
          </select>
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search state preview" aria-label="Search logs" />
          <button type="button" className="pill" aria-pressed={errorsOnly} onClick={() => { setErrorsOnly(!errorsOnly); setPage(0); }}>errors only</button>
        </div>
        {logs.loading ? <p className="mut">Loading…</p> : <LogsTable logs={logs.data?.logs ?? []} />}
        <div className="pager">
          <button type="button" className="mini" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
          <span>{logs.data?.total ?? 0} total</span>
          <button type="button" className="mini" disabled={!logs.data || (page + 1) * PAGE >= logs.data.total} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      </div>
    </>
    </RequireAuth>
  );
}
