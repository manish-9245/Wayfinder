"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "@/lib/api";
import { DailyChart, Kpis, LogsTable, PolicyBars, RequireAuth, platform, useAsync, usePlatform } from "@/components/dash";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "overview" | "users" | "keys" | "logs" | "system";
const PAGE = 25;
const POLICIES = ["llm_firewall", "support_inbound", "model_router", "content_safety"];
const VERDICTS = ["act", "allow", "review", "escalate", "block"];

const MONO_TH = "font-tsj-mono text-[11px] uppercase tracking-[0.14em]";

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 font-tsj-display text-xl font-bold tracking-tight">{children}</h2>;
}

export default function AdminPage() {
  const { getToken } = usePlatform();
  const [tab, setTab] = useState<Tab>("overview");
  const me = useAsync(() => platform.me(getToken));
  const denied = me.err || (me.data && me.data.role !== "admin");

  if (denied)
    return (
      <Card className="mx-auto mt-10 max-w-2xl">
        <CardHeader>
          <p className="eyebrow">Wayfinder — super-admin</p>
          <CardTitle className="mt-2 font-tsj-display">Super-admin only</CardTitle>
          <CardDescription>
            {me.err || `Signed in as ${me.data?.email} (${me.data?.role}). An admin promotes you via PATCH /v1/admin/users, or list your email in WAYFINDER_SUPERADMINS.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );

  return (
    <RequireAuth>
      <>
        <div className="mb-8 mt-6">
          <p className="eyebrow">Wayfinder — super-admin</p>
          <h1 className="mt-2 font-tsj-display text-4xl font-bold tracking-tight md:text-5xl">Admin</h1>
          <p className="mt-2 font-tsj-mono text-xs text-muted-foreground">
            {me.data ? `${me.data.email} · super-admin` : "loading…"}
          </p>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList aria-label="Admin sections" className="font-tsj-mono text-xs">
            {(["overview", "users", "keys", "logs", "system"] as Tab[]).map((t) => (
              <TabsTrigger key={t} value={t}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview" className="mt-6">
            <Overview getToken={getToken} />
          </TabsContent>
          <TabsContent value="users" className="mt-6">
            <Users getToken={getToken} />
          </TabsContent>
          <TabsContent value="keys" className="mt-6">
            <Keys getToken={getToken} />
          </TabsContent>
          <TabsContent value="logs" className="mt-6">
            <Logs getToken={getToken} />
          </TabsContent>
          <TabsContent value="system" className="mt-6">
            <System getToken={getToken} />
          </TabsContent>
        </Tabs>
      </>
    </RequireAuth>
  );
}

function Overview({ getToken }: { getToken: any }) {
  const ov = useAsync(() => platform.adminOverview(getToken));
  if (ov.loading) return <p className="font-tsj-mono text-xs text-muted-foreground">Loading…</p>;
  if (ov.err || !ov.data) return <p className="font-tsj-mono text-xs text-muted-foreground">{ov.err || "failed"}</p>;
  const d = ov.data, t = d.totals;
  return (
    <>
      <PanelTitle>Platform · 30 days</PanelTitle>
      <Kpis items={[
        { k: "Users", n: String(d.counts.users_active) },
        { k: "Active keys", n: String(d.counts.keys_active) },
        { k: "Requests · 30d", n: String(t.requests) },
        { k: "Hit rate", n: `${(t.cache_hit_rate * 100).toFixed(1)}%` },
        { k: "Blocks", n: String(t.blocks) },
        { k: "Errors", n: String(t.errors) },
        { k: "Avg / p95", n: `${t.avg_latency_ms}/${t.p95_latency_ms}ms` },
      ]} />
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <DailyChart daily={d.daily} />
        <PolicyBars rows={d.by_policy} />
      </div>
      <PanelTitle>Top users · 30d</PanelTitle>
      <div className="hairline-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={MONO_TH}>Email</TableHead>
              <TableHead className={MONO_TH}>Plan</TableHead>
              <TableHead className={MONO_TH}>Requests</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.top_users.map((u: any) => (
              <TableRow key={u.email}>
                <TableCell className="font-tsj-mono">{u.email}</TableCell>
                <TableCell className="font-tsj-grot">{u.plan}</TableCell>
                <TableCell className="font-tsj-mono">{u.requests}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
    <>
      <PanelTitle>Users</PanelTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search email" aria-label="Search users" className="h-10 min-w-44 flex-1" />
      </div>
      {list.loading ? (
        <p className="font-tsj-mono text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="hairline-t overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={MONO_TH}>Email</TableHead>
                <TableHead className={MONO_TH}>Role</TableHead>
                <TableHead className={MONO_TH}>Plan</TableHead>
                <TableHead className={MONO_TH}>Quota/mo</TableHead>
                <TableHead className={MONO_TH}>Keys</TableHead>
                <TableHead className={MONO_TH}>Req 30d</TableHead>
                <TableHead className={MONO_TH}>Active</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data?.users ?? []).map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-tsj-mono">{u.email}</TableCell>
                  <TableCell>
                    <Select value={u.role} onValueChange={(v) => patch(u.id, { role: v })}>
                      <SelectTrigger className="w-[110px]" aria-label={`Role for ${u.email}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">user</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={u.plan} onValueChange={(v) => patch(u.id, { plan: v })}>
                      <SelectTrigger className="w-[130px]" aria-label={`Plan for ${u.email}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">free</SelectItem>
                        <SelectItem value="pro">pro</SelectItem>
                        <SelectItem value="enterprise">enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-10 w-[110px]"
                      type="number"
                      min={0}
                      defaultValue={u.quota_monthly ?? ""}
                      placeholder="plan default"
                      aria-label={`Monthly quota for ${u.email}`}
                      onBlur={(e) => { if (e.target.value !== "") patch(u.id, { quota_monthly: Number(e.target.value) }); }}
                    />
                  </TableCell>
                  <TableCell className="font-tsj-mono">{u.keys_count}</TableCell>
                  <TableCell className="font-tsj-mono">{u.requests_30d}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant={u.is_active ? "default" : "outline"}
                      size="sm"
                      className="rounded-full"
                      aria-pressed={u.is_active}
                      onClick={() => patch(u.id, { is_active: !u.is_active })}
                    >
                      {u.is_active ? "active" : "disabled"}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        if (!confirm(`Delete ${u.email}? Their keys stop working immediately; request history is kept.`)) return;
                        try { await platform.deleteUser(u.id, getToken); list.reload(); toast("Deleted"); }
                        catch (e: any) { toast(e.message); }
                      }}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2.5 font-tsj-mono text-xs text-muted-foreground">
        <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
          <ArrowLeft aria-hidden="true" />Prev
        </Button>
        <span>{list.data?.total ?? 0} total</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!list.data || (page + 1) * PAGE >= list.data.total}
          onClick={() => setPage(page + 1)}
        >
          Next<ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </>
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
    <>
      <PanelTitle>All API keys</PanelTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search email, prefix, name" aria-label="Search keys" className="h-10 min-w-44 flex-1" />
      </div>
      {list.loading ? (
        <p className="font-tsj-mono text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="hairline-t overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={MONO_TH}>User</TableHead>
                <TableHead className={MONO_TH}>Name</TableHead>
                <TableHead className={MONO_TH}>Prefix</TableHead>
                <TableHead className={MONO_TH}>Calls</TableHead>
                <TableHead className={MONO_TH}>Last used</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data?.keys ?? []).map((k: any) => (
                <TableRow key={k.prefix}>
                  <TableCell className="font-tsj-mono">{k.email}</TableCell>
                  <TableCell className="font-tsj-grot">{k.name}</TableCell>
                  <TableCell className="font-tsj-mono">
                    {k.prefix}
                    {!k.is_active && <Badge variant="secondary" className="ml-1.5">revoked</Badge>}
                  </TableCell>
                  <TableCell className="font-tsj-mono">{k.request_count}</TableCell>
                  <TableCell className="font-tsj-mono">{k.last_used_at ? new Date(k.last_used_at + "Z").toLocaleString() : "never"}</TableCell>
                  <TableCell>
                    {k.is_active && (
                      <Button type="button" variant="destructive" size="sm" onClick={() => revoke(k.prefix)}>
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2.5 font-tsj-mono text-xs text-muted-foreground">
        <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
          <ArrowLeft aria-hidden="true" />Prev
        </Button>
        <span>{list.data?.total ?? 0} total</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!list.data || (page + 1) * PAGE >= list.data.total}
          onClick={() => setPage(page + 1)}
        >
          Next<ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </>
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
    <>
      <PanelTitle>Platform request logs</PanelTitle>
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
        <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search state preview" aria-label="Search logs" className="h-10 min-w-44 flex-1" />
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
      {logs.loading ? <p className="font-tsj-mono text-xs text-muted-foreground">Loading…</p> : <LogsTable logs={logs.data?.logs ?? []} showEmail />}
      <div className="mt-3 flex items-center gap-2.5 font-tsj-mono text-xs text-muted-foreground">
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
    </>
  );
}

function System({ getToken }: { getToken: any }) {
  const sys = useAsync(() => platform.adminSystem(getToken));
  if (sys.loading) return <p className="font-tsj-mono text-xs text-muted-foreground">Loading…</p>;
  if (sys.err || !sys.data) return <p className="font-tsj-mono text-xs text-muted-foreground">{sys.err || "failed"}</p>;
  const s = sys.data;
  const kv: [string, string][] = [
    ["Router", s.status],
    ["Policies", (s.policies ?? []).join(", ")],
    ["Cache entries", String(s.cache_entries)],
    ["Redis shared cache", s.redis ? "connected" : "local LRU only"],
    ["Database", s.db ? "ok" : "DOWN"],
    ["Auth", `${s.auth_provider ?? "supertokens"} · ${s.auth_enabled ? "enabled" : "disabled (dev-admin mode)"}`],
  ];
  return (
    <>
      <PanelTitle>System health</PanelTitle>
      <div className="hairline-t mb-6">
        <Table>
          <TableBody>
            {kv.map(([k, v]) => (
              <TableRow key={k}>
                <TableHead className={`${MONO_TH} w-44`}>{k}</TableHead>
                <TableCell className="font-tsj-mono">{v}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <PanelTitle>Rate limits · per minute</PanelTitle>
          <div className="hairline-t">
            <Table>
              <TableBody>
                {Object.entries(s.limits_per_min ?? {}).map(([k, v]) => (
                  <TableRow key={k}>
                    <TableHead className={MONO_TH}>{k}</TableHead>
                    <TableCell className="font-tsj-mono">{String(v)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <div>
          <PanelTitle>Quotas · per month</PanelTitle>
          <div className="hairline-t">
            <Table>
              <TableBody>
                {Object.entries(s.quotas_monthly ?? {}).map(([k, v]) => (
                  <TableRow key={k}>
                    <TableHead className={MONO_TH}>{k}</TableHead>
                    <TableCell className="font-tsj-mono">{String(v)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </>
  );
}
