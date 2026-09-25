"use client";
import { useEffect, useState } from "react";
import { SessionAuth } from "supertokens-auth-react/recipe/session";
import { AUTH_OFF } from "@/lib/supertokens";
import { platform, type GetToken, type LogRow } from "@/lib/platform";
import { Spotlight } from "@/components/aceternity/spotlight";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function usePlatform() {
  const getToken: GetToken = async () => null;
  return { getToken };
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  if (AUTH_OFF) return <>{children}</>;
  return <SessionAuth>{children}</SessionAuth>;
}

export function Kpis({ items }: { items: { k: string; n: string }[] }) {
  return (
    <div className="mb-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((i) => (
        <Spotlight key={i.k} className="rounded-lg">
        <Card className="h-full">
          <CardContent className="pt-4">
            <div className="font-tsj-mono text-[11px] uppercase tracking-widest text-muted-foreground">{i.k}</div>
            <div className="font-tsj-display text-[26px] font-bold tabular-nums tracking-tight">{i.n}</div>
          </CardContent>
        </Card>
        </Spotlight>
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
    <Spotlight className="rounded-lg">
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-tsj-grot">Requests per day</CardTitle>
      </CardHeader>
      <CardContent>
        <svg className="block h-[120px] w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Requests per day, peak ${max}`}>
          <polyline points={pts.join(" ")} fill="none" stroke="hsl(var(--info))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => {
            const [x, y] = p.split(",");
            return (
              <circle key={i} cx={x} cy={y} r="3" fill="hsl(var(--info))">
                <title>{`${daily[i].day}: ${daily[i].requests}`}</title>
              </circle>
            );
          })}
        </svg>
        <CardDescription className="font-tsj-mono text-xs">
          Peak {max}/day · last {daily.length} days
        </CardDescription>
      </CardContent>
    </Card>
    </Spotlight>
  );
}

export function PolicyBars({ rows }: { rows: { policy: string; requests: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.requests));
  return (
    <Spotlight className="rounded-lg">
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-tsj-grot">By policy</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 && <p className="text-[13px] text-muted-foreground">No traffic yet.</p>}
        {rows.map((r) => (
          <div key={r.policy}>
            <div className="mt-2.5 flex items-baseline justify-between gap-3 text-[13px]">
              <code className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs tabular-nums">{r.policy}</code>
              <span className="font-mono tabular-nums text-muted-foreground">{r.requests}</span>
            </div>
            <Progress value={(r.requests / max) * 100} className="my-1.5 h-2" />
          </div>
        ))}
      </CardContent>
    </Card>
    </Spotlight>
  );
}

export function verdictChip(v: string) {
  const variant = v === "act" || v === "allow" ? "success" : v === "block" || v === "escalate" ? "destructive" : v ? "warning" : "secondary";
  return <Badge variant={variant}>{v || "—"}</Badge>;
}

export function LogsTable({ logs, showEmail }: { logs: LogRow[]; showEmail?: boolean }) {
  if (!logs.length) return <p className="text-[13px] text-muted-foreground">No requests match.</p>;
  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          {showEmail && <TableHead>User</TableHead>}
          <TableHead>Policy</TableHead>
          <TableHead>Verdict</TableHead>
          <TableHead>Conf</TableHead>
          <TableHead>ms</TableHead>
          <TableHead>Cache</TableHead>
          <TableHead>Preview</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((l) => (
          <TableRow key={l.id}>
            <TableCell className="font-mono">{l.created_at ? new Date(l.created_at + "Z").toLocaleString() : "—"}</TableCell>
            {showEmail && <TableCell className="font-mono">{l.email || `#${l.user_id ?? "?"}`}</TableCell>}
            <TableCell>
              <code className="rounded border bg-background px-1.5 py-px font-mono text-xs">{l.policy || "—"}</code>
            </TableCell>
            <TableCell>
              <span className="flex flex-wrap items-center gap-1.5">
                {verdictChip(l.verdict)}
                {l.error && <Badge variant="destructive">err {l.status_code}</Badge>}
              </span>
            </TableCell>
            <TableCell className="font-mono">{l.confidence != null ? l.confidence.toFixed(2) : "—"}</TableCell>
            <TableCell className="font-mono">{l.latency_ms.toFixed(0)}</TableCell>
            <TableCell>{l.cache_hit ? "hit" : "miss"}</TableCell>
            <TableCell className="font-mono">{l.state_preview.slice(0, 90)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
      (d) => {
        if (live) {
          setData(d);
          setErr("");
        }
      },
      (e: any) => {
        if (live) setErr(e?.message || "failed");
      }
    ).finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { data, err, loading, reload: () => setNonce((n) => n + 1) };
}

export { platform };
