"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "@/lib/api";
import { saveKeyForConsole } from "@/lib/platform";
import { DailyChart, Kpis, LogsTable, PolicyBars, RequireAuth, platform, useAsync, usePlatform } from "@/components/dash";
import { Spotlight } from "@/components/aceternity/spotlight";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE = 25;
const POLICIES = ["llm_firewall", "support_inbound", "model_router", "content_safety"];
const VERDICTS = ["act", "allow", "review", "escalate", "block"];

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
      <Card className="mx-auto mt-10 max-w-2xl">
        <CardHeader>
          <CardTitle>Dashboard unavailable</CardTitle>
          <CardDescription>{me.err}. The gateway may be offline or sign-in is required.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
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
        <div className="mb-4 mt-6">
          <h1 className="text-3xl font-bold tracking-tight">
            Dashboard{" "}
            <span className="text-lg font-medium text-muted-foreground">
              · {me.data ? `${me.data.email} · ${me.data.plan}` : "loading…"}
            </span>
          </h1>
          <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
            Keys, usage, and request logs for your account. New here?{" "}
            <Link href="/console" className="text-info hover:underline">Try the console</Link>, then grab a key below.
          </p>
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

        <Spotlight className="mb-3.5 rounded-lg">
        <Card>
          <CardHeader>
            <CardTitle>Monthly quota</CardTitle>
          </CardHeader>
          <CardContent>
            {quota == null ? (
              <CardDescription>
                Unlimited on your plan ({me.data?.rate_per_min === 0 ? "no" : me.data?.rate_per_min}/min rate limit).
              </CardDescription>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <code className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs tabular-nums">{quotaUsed} / {quota}</code>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {((quotaUsed / Math.max(1, quota)) * 100).toFixed(0)}%
                  </span>
                </div>
                <Progress value={Math.min(100, (quotaUsed / Math.max(1, quota)) * 100)} className="mt-1.5" />
              </>
            )}
          </CardContent>
        </Card>
        </Spotlight>

        <div className="mb-3.5 grid gap-3.5 lg:grid-cols-2">
          {usage.data && <DailyChart daily={usage.data.daily} />}
          {usage.data && <PolicyBars rows={usage.data.by_policy} />}
        </div>

        <Spotlight className="mb-3.5 rounded-lg">
        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
            <CardDescription>
              Service keys start with <code className="rounded border bg-background px-1.5 py-px font-mono text-xs">wf_</code>.
              The raw secret is shown once — store it in an env var. Creating a key also enables it in this
              browser&apos;s console.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {freshKey && (
              <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-md border border-dashed border-info bg-background px-3.5 py-3 font-mono text-[13px]" role="status">
                <span className="break-all">{freshKey}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(freshKey); toast("Copied"); }}>
                  Copy
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setFreshKey("")}>
                  Dismiss
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name" aria-label="Key name" className="h-10 max-w-60 flex-1" />
              <Button type="button" onClick={createKey} disabled={busy}>
                {busy && <Loader2 aria-hidden="true" className="animate-spin" />}{busy ? "Creating…" : "Create key"}
              </Button>
            </div>
            {(keys.data?.length ?? 0) > 0 && (
              <div className="mt-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead>Calls</TableHead>
                      <TableHead>Last used</TableHead>
                      <TableHead><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.data!.map((k) => (
                      <TableRow key={k.prefix}>
                        <TableCell>{k.name}</TableCell>
                        <TableCell className="font-mono">
                          {k.prefix}
                          {!k.is_active && <Badge variant="secondary" className="ml-1.5">revoked</Badge>}
                        </TableCell>
                        <TableCell className="font-mono">{k.request_count}</TableCell>
                        <TableCell className="font-mono">{k.last_used_at ? new Date(k.last_used_at + "Z").toLocaleString() : "never"}</TableCell>
                        <TableCell>
                          {k.is_active && (
                            <span className="flex flex-wrap gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const raw = prompt("Paste the raw wf_… secret to enable it in this browser's console:");
                                  if (raw) { saveKeyForConsole(raw); toast("Console will use this key"); }
                                }}
                              >
                                Use in console
                              </Button>
                              <Button type="button" variant="destructive" size="sm" onClick={() => revoke(k.prefix)}>
                                Revoke
                              </Button>
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        </Spotlight>

        <Card>
          <CardHeader>
            <CardTitle>Request logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <Select value={policy || "all"} onValueChange={(v) => { setPolicy(v === "all" ? "" : v); setPage(0); }}>
                <SelectTrigger className="w-[170px]" aria-label="Policy filter">
                  <SelectValue placeholder="All policies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All policies</SelectItem>
                  {POLICIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={verdict || "all"} onValueChange={(v) => { setVerdict(v === "all" ? "" : v); setPage(0); }}>
                <SelectTrigger className="w-[150px]" aria-label="Verdict filter">
                  <SelectValue placeholder="All verdicts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All verdicts</SelectItem>
                  {VERDICTS.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search state preview"
                aria-label="Search logs"
                className="h-10 min-w-44 flex-1"
              />
              <Button
                type="button"
                variant={errorsOnly ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                aria-pressed={errorsOnly}
                onClick={() => { setErrorsOnly(!errorsOnly); setPage(0); }}
              >
                errors only
              </Button>
            </div>
            {logs.loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <LogsTable logs={logs.data?.logs ?? []} />
            )}
            <div className="mt-3 flex items-center gap-2.5 text-[13px] text-muted-foreground">
              <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ArrowLeft aria-hidden="true" />Prev
              </Button>
              <span>{logs.data?.total ?? 0} total</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!logs.data || (page + 1) * PAGE >= logs.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next<ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    </RequireAuth>
  );
}
