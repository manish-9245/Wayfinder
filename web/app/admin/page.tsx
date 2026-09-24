"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/api";
import { DailyChart, Kpis, LogsTable, PolicyBars, platform, useAsync, usePlatform } from "@/components/dash";

type Tab = "overview" | "users" | "keys" | "logs" | "system";
const PAGE = 25;

export default function AdminPage() {
  const { getToken } = usePlatform();
  const [tab, setTab] = useState<Tab>("overview");
  const me = useAsync(() => platform.me(getToken));
  const denied = me.err || (me.data && me.data.role !== "admin");

  if (denied)
    return (
      <div className="chapter narrow">
        <h1 className="display">Super-admin only</h1>
        <p className="mut">
          {me.err || `Signed in as ${me.data?.email} (${me.data?.role}). An admin promotes you via PATCH /v1/admin/users, or list your email in WAYFINDER_SUPERADMINS.`}
        </p>
        <p><Link className="ghost btn-link" href="/dashboard">Back to dashboard</Link></p>
      </div>
    );

  return (
    <>
      <div className="dash-head">
        <h1>Admin</h1>
        <span className="mut mono">{me.data ? `${me.data.email} · super-admin` : "loading…"}</span>
      </div>
      <div className="tabrow" role="tablist" aria-label="Admin sections">
        {(["overview", "users", "keys", "logs", "system"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === "overview" && <Overview getToken={getToken} />}
      {tab === "users" && <Users getToken={getToken} />}
      {tab === "keys" && <Keys getToken={getToken} />}
      {tab === "logs" && <Logs getToken={getToken} />}
      {tab === "system" && <System getToken={getToken} />}
    </>
  );
}

function Overview({ getToken }: { getToken: any }) {
  const ov = useAsync(() => platform.adminOverview(getToken));
  if (ov.loading) return <p className="mut">Loading…</p>;
  if (ov.err || !ov.data) return <p className="mut">{ov.err || "failed"}</p>;
  const d = ov.data, t = d.totals;
  return (
    <>
      <Kpis items={[
        { k: "Users", n: String(d.counts.users_active) },
        { k: "Active keys", n: String(d.counts.keys_active) },
        { k: "Requests · 30d", n: String(t.requests) },
        { k: "Hit rate", n: `${(t.cache_hit_rate * 100).toFixed(1)}%` },
        { k: "Blocks", n: String(t.blocks) },
        { k: "Errors", n: String(t.errors) },
        { k: "Avg / p95", n: `${t.avg_latency_ms}/${t.p95_latency_ms}ms` },
      ]} />
      <div className="dash-grid">
        <DailyChart daily={d.daily} />
        <PolicyBars rows={d.by_policy} />
      </div>
      <div className="card">
        <h3>Top users · 30d</h3>
        <div className="res-wrap">
          <table className="res">
            <thead><tr><th>Email</th><th>Plan</th><th>Requests</th></tr></thead>
            <tbody>{d.top_users.map((u: any) => (
              <tr key={u.email}><td className="mono">{u.email}</td><td>{u.plan}</td><td className="mono">{u.requests}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Users({ getToken }: { getToken: any }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const q = `?search=${encodeURIComponent(search)}&limit=${PAGE}&offset=${page * PAGE}`;
  const list = useAsync(() => platform.adminUsers(getToken, q), [search, page]);

  const patch = async (id: number, body: Record<string, any>) => {
    try { await platform.patchUser(id, body, getToken); list.reload(); toast("Updated"); }
    catch (e: any) { toast(e.message); }
  };

  return (
    <div className="card">
      <h3>Users</h3>
      <div className="toolbar">
        <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search email" aria-label="Search users" />
      </div>
      {list.loading ? <p className="mut">Loading…</p> : (
        <div className="res-wrap">
          <table className="res">
            <thead><tr><th>Email</th><th>Role</th><th>Plan</th><th>Quota/mo</th><th>Keys</th><th>Req 30d</th><th>Active</th></tr></thead>
            <tbody>{(list.data?.users ?? []).map((u: any) => (
              <tr key={u.id}>
                <td className="mono">{u.email}</td>
                <td>
                  <select className="inline" value={u.role} aria-label={`Role for ${u.email}`}
                    onChange={(e) => patch(u.id, { role: e.target.value })}>
                    <option value="user">user</option><option value="admin">admin</option>
                  </select>
                </td>
                <td>
                  <select className="inline" value={u.plan} aria-label={`Plan for ${u.email}`}
                    onChange={(e) => patch(u.id, { plan: e.target.value })}>
                    <option value="free">free</option><option value="pro">pro</option><option value="enterprise">enterprise</option>
                  </select>
                </td>
                <td>
                  <input className="inline" type="number" min={0} defaultValue={u.quota_monthly ?? ""} placeholder="plan default"
                    aria-label={`Monthly quota for ${u.email}`} style={{ width: 110 }}
                    onBlur={(e) => { if (e.target.value !== "") patch(u.id, { quota_monthly: Number(e.target.value) }); }} />
                </td>
                <td className="mono">{u.keys_count}</td>
                <td className="mono">{u.requests_30d}</td>
                <td>
                  <button type="button" className="pill" aria-pressed={u.is_active}
                    onClick={() => patch(u.id, { is_active: !u.is_active })}>
                    {u.is_active ? "active" : "disabled"}
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="pager">
        <button type="button" className="mini" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
        <span>{list.data?.total ?? 0} total</span>
        <button type="button" className="mini" disabled={!list.data || (page + 1) * PAGE >= list.data.total} onClick={() => setPage(page + 1)}>Next →</button>
      </div>
    </div>
  );
}

function Keys({ getToken }: { getToken: any }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const q = `?search=${encodeURIComponent(search)}&limit=${PAGE}&offset=${page * PAGE}`;
  const list = useAsync(() => platform.adminKeys(getToken, q), [search, page]);

  const revoke = async (prefix: string) => {
    if (!confirm(`Revoke ${prefix} platform-wide?`)) return;
    try { await platform.adminRevokeKey(prefix, getToken); list.reload(); toast("Revoked"); }
    catch (e: any) { toast(e.message); }
  };

  return (
    <div className="card">
      <h3>All API keys</h3>
      <div className="toolbar">
        <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search email, prefix, name" aria-label="Search keys" />
      </div>
      {list.loading ? <p className="mut">Loading…</p> : (
        <div className="res-wrap">
          <table className="res">
            <thead><tr><th>User</th><th>Name</th><th>Prefix</th><th>Calls</th><th>Last used</th><th></th></tr></thead>
            <tbody>{(list.data?.keys ?? []).map((k: any) => (
              <tr key={k.prefix}>
                <td className="mono">{k.email}</td>
                <td>{k.name}</td>
                <td className="mono">{k.prefix}{k.is_active ? "" : " (revoked)"}</td>
                <td className="mono">{k.request_count}</td>
                <td className="mono">{k.last_used_at ? new Date(k.last_used_at + "Z").toLocaleString() : "never"}</td>
                <td>{k.is_active && <button type="button" className="danger" onClick={() => revoke(k.prefix)}>Revoke</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="pager">
        <button type="button" className="mini" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
        <span>{list.data?.total ?? 0} total</span>
        <button type="button" className="mini" disabled={!list.data || (page + 1) * PAGE >= list.data.total} onClick={() => setPage(page + 1)}>Next →</button>
      </div>
    </div>
  );
}

function Logs({ getToken }: { getToken: any }) {
  const [policy, setPolicy] = useState("");
  const [verdict, setVerdict] = useState("");
  const [search, setSearch] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [page, setPage] = useState(0);
  const q = `?policy=${encodeURIComponent(policy)}&verdict=${encodeURIComponent(verdict)}&search=${encodeURIComponent(search)}${errorsOnly ? "&errors_only=true" : ""}&limit=${PAGE}&offset=${page * PAGE}`;
  const logs = useAsync(() => platform.adminLogs(getToken, q), [policy, verdict, search, errorsOnly, page]);

  return (
    <div className="card">
      <h3>Platform request logs</h3>
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
      {logs.loading ? <p className="mut">Loading…</p> : <LogsTable logs={logs.data?.logs ?? []} showEmail />}
      <div className="pager">
        <button type="button" className="mini" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
        <span>{logs.data?.total ?? 0} total</span>
        <button type="button" className="mini" disabled={!logs.data || (page + 1) * PAGE >= logs.data.total} onClick={() => setPage(page + 1)}>Next →</button>
      </div>
    </div>
  );
}

function System({ getToken }: { getToken: any }) {
  const sys = useAsync(() => platform.adminSystem(getToken));
  if (sys.loading) return <p className="mut">Loading…</p>;
  if (sys.err || !sys.data) return <p className="mut">{sys.err || "failed"}</p>;
  const s = sys.data;
  const kv: [string, string][] = [
    ["Router", s.status],
    ["Policies", (s.policies ?? []).join(", ")],
    ["Cache entries", String(s.cache_entries)],
    ["Redis shared cache", s.redis ? "connected" : "local LRU only"],
    ["Database", s.db ? "ok" : "DOWN"],
    ["Clerk auth", s.clerk_enabled ? "enabled" : "disabled (dev-admin mode)"],
  ];
  return (
    <>
      <div className="card">
        <h3>System health</h3>
        <div className="res-wrap">
          <table className="res"><tbody>
            {kv.map(([k, v]) => <tr key={k}><th>{k}</th><td className="mono">{v}</td></tr>)}
          </tbody></table>
        </div>
      </div>
      <div className="dash-grid">
        <div className="card">
          <h3>Rate limits · per minute</h3>
          <div className="res-wrap">
            <table className="res"><tbody>
              {Object.entries(s.limits_per_min ?? {}).map(([k, v]) => (
                <tr key={k}><th>{k}</th><td className="mono">{String(v)}</td></tr>
              ))}
            </tbody></table>
          </div>
        </div>
        <div className="card">
          <h3>Quotas · per month</h3>
          <div className="res-wrap">
            <table className="res"><tbody>
              {Object.entries(s.quotas_monthly ?? {}).map(([k, v]) => (
                <tr key={k}><th>{k}</th><td className="mono">{String(v)}</td></tr>
              ))}
            </tbody></table>
          </div>
        </div>
      </div>
    </>
  );
}
