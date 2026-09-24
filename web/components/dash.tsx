"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { CLERK_ON } from "./AuthState";
import { platform, type GetToken, type LogRow } from "@/lib/platform";

/** Binds platform calls to the Clerk session (or saved key / open dev). */
export function usePlatform() {
  const auth = CLERK_ON ? useAuth() : null;
  const getToken: GetToken = async () => {
    try {
      return (await auth?.getToken()) ?? null;
    } catch {
      return null;
    }
  };
  return { getToken, signedIn: CLERK_ON ? !!auth?.userId : true };
}

export function Kpis({ items }: { items: { k: string; n: string }[] }) {
  return (
    <div className="kpis">
      {items.map((i) => (
        <div className="kpi" key={i.k}>
          <div className="k">{i.k}</div>
          <div className="n">{i.n}</div>
        </div>
      ))}
    </div>
  );
}

export function DailyChart({ daily }: { daily: { day: string; requests: number }[] }) {
  const max = Math.max(1, ...daily.map((d) => d.requests));
  const W = 600, H = 120, P = 8;
  const pts = daily.map((d, i) => {
    const x = P + (i / Math.max(1, daily.length - 1)) * (W - 2 * P);
    const y = H - P - (d.requests / max) * (H - 2 * P);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <div className="card">
      <h3>Requests per day</h3>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Requests per day, peak ${max}`}>
        <polyline points={pts.join(" ")} fill="none" stroke="var(--color-info)" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => {
          const [x, y] = p.split(",");
          return <circle key={i} cx={x} cy={y} r="3" fill="var(--color-info)"><title>{`${daily[i].day}: ${daily[i].requests}`}</title></circle>;
        })}
      </svg>
      <p className="mut">Peak {max}/day · last {daily.length} days</p>
    </div>
  );
}

export function PolicyBars({ rows }: { rows: { policy: string; requests: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.requests));
  return (
    <div className="card">
      <h3>By policy</h3>
      {rows.length === 0 && <p className="mut">No traffic yet.</p>}
      {rows.map((r) => (
        <div key={r.policy}>
          <div className="prow"><code>{r.policy}</code><span className="pct">{r.requests}</span></div>
          <div className="bar"><div className="fill" style={{ width: `${(r.requests / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function verdictChip(v: string) {
  const cls = v === "act" || v === "allow" ? "ok"
    : v === "review" || v === "escalate" ? "warn"
    : v === "block" ? "bad" : "mut";
  return <span className={`vchip ${cls}`}>{v || "—"}</span>;
}

export function LogsTable({ logs, showEmail }: { logs: LogRow[]; showEmail?: boolean }) {
  if (!logs.length) return <p className="mut">No requests match.</p>;
  return (
    <div className="res-wrap">
      <table className="res">
        <thead><tr>
          <th>Time</th>{showEmail && <th>User</th>}<th>Policy</th><th>Verdict</th>
          <th>Conf</th><th>ms</th><th>Cache</th><th>Preview</th>
        </tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="mono">{l.created_at ? new Date(l.created_at + "Z").toLocaleString() : "—"}</td>
              {showEmail && <td className="mono">{l.email || `#${l.user_id ?? "?"}`}</td>}
              <td><code>{l.policy || "—"}</code></td>
              <td>{verdictChip(l.verdict)}{l.error && <span className="vchip bad">err {l.status_code}</span>}</td>
              <td className="mono">{l.confidence != null ? l.confidence.toFixed(2) : "—"}</td>
              <td className="mono">{l.latency_ms.toFixed(0)}</td>
              <td>{l.cache_hit ? "hit" : "miss"}</td>
              <td className="mono">{l.state_preview.slice(0, 90)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn().then(
      (d) => { if (live) { setData(d); setErr(""); } },
      (e: any) => { if (live) setErr(e?.message || "failed"); },
    ).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { data, err, loading, reload: () => setNonce((n) => n + 1) };
}

export { platform };
