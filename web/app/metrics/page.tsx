"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { JsonBlock } from "@/components/json-block";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

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
    ["rejected · auth", m.rejected_401 ?? 0],
    ["rejected · limits", m.rejected_429 ?? 0],
    ["cache entries", health?.cache_entries ?? "none"],
  ] : [];
  const hit = m ? Math.min(1, Math.max(0, m.cache_hit_rate || 0)) : 0;
  const C = 2 * Math.PI * 52;

  return (
    <>
      <div className="mb-8 mt-6">
        <p className="eyebrow">Wayfinder — runtime</p>
        <h1 className="mt-2 font-tsj-display text-4xl font-bold tracking-tight md:text-5xl">Metrics</h1>
        <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">Hit rate is the whole game.</p>
      </div>

      <section aria-label="Key numbers" className="mb-10">
        <div className="mb-3 flex items-baseline gap-4">
          <span className="section-num">01</span>
          <h2 className="font-tsj-display text-xl font-bold tracking-tight">At a glance</h2>
          {!m && <span className="ml-auto font-tsj-mono text-[11px] text-muted-foreground">metrics unavailable — is the gateway running?</span>}
        </div>
        {m ? (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {kpis.map(([k, v]) => (
              <div key={k} className="hairline-t pt-3">
                <dt className="font-tsj-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{k}</dt>
                <dd className="mt-1 font-tsj-display text-4xl font-bold tabular-nums tracking-tight">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <Skeleton className="h-[120px]" />
        )}
      </section>

      <section aria-label="Cache hit rate" className="mb-10">
        <div className="mb-3 flex items-baseline gap-4">
          <span className="section-num">02</span>
          <h2 className="font-tsj-display text-xl font-bold tracking-tight">Hit rate</h2>
        </div>
        {m ? (
          <div className="hairline-t flex flex-wrap items-center gap-6 pt-5" role="img" aria-label={`Cache hit rate ${(hit * 100).toFixed(1)} percent`}>
            <svg viewBox="0 0 120 120" aria-hidden="true" className="size-[120px] flex-none">
              <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
              <circle
                cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--primary))" strokeWidth="10"
                strokeLinecap="round" strokeDasharray={`${(hit * C).toFixed(1)} ${C.toFixed(1)}`}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div>
              <div className="font-tsj-display text-5xl font-bold tabular-nums tracking-tight">{(hit * 100).toFixed(1)}%</div>
              <p className="mt-1 font-tsj-mono text-xs text-muted-foreground">cache hit rate · repeats never touch the model</p>
            </div>
          </div>
        ) : (
          <Skeleton className="h-[160px]" />
        )}
      </section>

      <section aria-label="Runtime config">
        <div className="mb-3 flex items-baseline gap-4">
          <span className="section-num">03</span>
          <h2 className="font-tsj-display text-xl font-bold tracking-tight">Runtime config</h2>
        </div>
        <Label className="sr-only">Runtime config</Label>
        <JsonBlock label="Runtime config" data={health} />
        <p className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={refresh}>Refresh now</Button>
          <span className="font-tsj-mono text-xs text-muted-foreground">auto-refreshes every 3s while open</span>
        </p>
      </section>
    </>
  );
}
