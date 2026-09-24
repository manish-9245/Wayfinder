"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Spotlight } from "@/components/aceternity/spotlight";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
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
      <div className="mb-4 mt-6">
        <h1 className="text-4xl font-bold tracking-tight">Metrics.</h1>
        <p className="mt-1 text-sm text-muted-foreground">Hit rate is the whole game.</p>
      </div>
      <div className="mb-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {!m ? (
          <p className="col-span-full text-sm text-muted-foreground">metrics unavailable. Is the gateway running?</p>
        ) : (
          kpis.map(([k, v]) => (
            <Card key={k}>
              <CardContent className="pt-4">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{k}</div>
                <div className="text-[26px] font-bold tabular-nums tracking-tight">{v}</div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      {m ? (
        <Spotlight className="mb-3.5 rounded-lg">
        <Card>
          <CardContent className="flex items-center gap-5 pt-5" role="img" aria-label={`Cache hit rate ${(hit * 100).toFixed(1)} percent`}>
            <svg viewBox="0 0 120 120" aria-hidden="true" className="size-[120px] flex-none">
              <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
              <circle
                cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--primary))" strokeWidth="10"
                strokeLinecap="round" strokeDasharray={`${(hit * C).toFixed(1)} ${C.toFixed(1)}`}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div>
              <div className="text-3xl font-bold tabular-nums tracking-tight">{(hit * 100).toFixed(1)}%</div>
              <CardDescription>cache hit rate. Repeats never touch the model.</CardDescription>
            </div>
          </CardContent>
        </Card>
        </Spotlight>
      ) : (
        <Skeleton className="mb-3.5 h-[160px]" />
      )}
      <Card>
        <CardContent className="pt-5">
          <Label>Runtime config</Label>
          <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-3.5 font-mono text-xs leading-6" tabIndex={0}>
            {JSON.stringify(health, null, 2)}
          </pre>
          <p className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={refresh}>Refresh now</Button>
            <span className="text-[13px] text-muted-foreground">auto-refreshes every 3s while open</span>
          </p>
        </CardContent>
      </Card>
    </>
  );
}
