"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function MetricsPage() {
  useEffect(() => { document.title = "Metrics — wayfinder"; }, []);
  const [m, setM] = useState<Record<string, number> | null>(null);
  const [health, setHealth] = useState<any>(null);

  const refresh = useCallback(async () => {
    try {
      const [mm, h] = await Promise.all([api.metrics(), api.health()]);
      setM(mm); setHealth(h);
    } catch { setM(null); }
  }, []);

  useEffect(() => {
    refresh();
    const h = setInterval(refresh, 3000);
    return () => clearInterval(h);
  }, [refresh]);

  const kpis = m ? [
    ["requests", m.requests],
    ["cache hit rate", ((m.cache_hit_rate || 0) * 100).toFixed(1) + "%"],
    ["avg latency", (m.avg_latency_ms || 0) + "ms"],
    ["blocks", m.blocks],
    ["errors", m.errors],
    ["cache entries", health?.cache_entries ?? "none"],
  ] : [];
  const hit = m ? Math.min(1, Math.max(0, m.cache_hit_rate || 0)) : 0;
  const C = 2 * Math.PI * 52;

  return (
    <>
      <div className="console-head"><h1 className="display">Metrics.</h1>
        <p className="mut">Hit rate is the whole game.</p></div>
      <div className="kpis">
        {m ? kpis.map(([k, v]) => (
          <div className="kpi" key={k}><div className="k">{k}</div><div className="n">{v}</div></div>
        )) : <p className="mut">metrics unavailable. Is the gateway running?</p>}
      </div>
      {m && (
        <div className="card gauge" role="img" aria-label={`Cache hit rate ${(hit * 100).toFixed(1)} percent`}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-border)" strokeWidth="10" />
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-accent)" strokeWidth="10"
              strokeLinecap="round" strokeDasharray={`${(hit * C).toFixed(1)} ${C.toFixed(1)}`}
              transform="rotate(-90 60 60)" />
          </svg>
          <div><div className="gt">{(hit * 100).toFixed(1)}%</div>
            <div className="mut">cache hit rate. Repeats never touch the model.</div></div>
        </div>
      )}
      <div className="card"><span className="lbl">Runtime config</span>
        <pre className="raw" tabIndex={0}>{JSON.stringify(health, null, 2)}</pre>
        <p><button className="ghost" onClick={refresh}>Refresh now</button>{" "}
          <span className="mut">auto-refreshes every 3s while open</span></p>
      </div>
    </>
  );
}
