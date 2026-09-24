"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "@/lib/api";
import { DailyChart, Kpis, LogsTable, PolicyBars, RequireAuth, platform, useAsync, usePlatform } from "@/components/dash";
import { Spotlight } from "@/components/aceternity/spotlight";
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

export default function AdminPage() {
  const { getToken } = usePlatform();
  const [tab, setTab] = useState<Tab>("overview");
  const me = useAsync(() => platform.me(getToken));
  const denied = me.err || (me.data && me.data.role !== "admin");

  if (denied)
    return (
      <Card className="mx-auto mt-10 max-w-2xl">
        <CardHeader>
          <CardTitle>Super-admin only</CardTitle>
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
        <div className="mb-4 mt-6 flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <span className="font-mono text-xs text-muted-foreground">
            {me.data ? `${me.data.email} · super-admin` : "loading…"}
          </span>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList aria-label="Admin sections">
            {(["overview", "users", "keys", "logs", "system"] as Tab[]).map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview">
            <Overview getToken={getToken} />
          </TabsContent>
          <TabsContent value="users">
            <Users getToken={getToken} />
          </TabsContent>
          <TabsContent value="keys">
            <Keys getToken={getToken} />
          </TabsContent>
          <TabsContent value="logs">
            <Logs getToken={getToken} />
          </TabsContent>
          <TabsContent value="system">
            <System getToken={getToken} />
          </TabsContent>
        </Tabs>
      </>
    </RequireAuth>
  );
}

function Overview({ getToken }: { getToken: any }) {
  const ov = useAsync(() => platform.adminOverview(getToken));
  if (ov.loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (ov.err || !ov.data) return <p className="text-sm text-muted-foreground">{ov.err || "failed"}</p>;
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
      <div className="mb-3.5 grid gap-3.5 lg:grid-cols-2">
        <DailyChart daily={d.daily} />
        <PolicyBars rows={d.by_policy} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Top users · 30d</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Requests</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.top_users.map((u: any) => (
                <TableRow key={u.email}>
                  <TableCell className="font-mono">{u.email}</TableCell>
                  <TableCell>{u.plan}</TableCell>
                  <TableCell className="font-mono">{u.requests}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search email" aria-label="Search users" className="h-10 min-w-44 flex-1" />
        </div>
        {list.loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Quota/mo</TableHead>
                <TableHead>Keys</TableHead>
                <TableHead>Req 30d</TableHead>
                <TableHead>Active</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data?.users ?? []).map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono">{u.email}</TableCell>
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
                  <TableCell className="font-mono">{u.keys_count}</TableCell>
                  <TableCell className="font-mono">{u.requests_30d}</TableCell>
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
        )}
        <div className="mt-3 flex items-center gap-2.5 text-[13px] text-muted-foreground">
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
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>All API keys</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search email, prefix, name" aria-label="Search keys" className="h-10 min-w-44 flex-1" />
        </div>
        {list.loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data?.keys ?? []).map((k: any) => (
                <TableRow key={k.prefix}>
                  <TableCell className="font-mono">{k.email}</TableCell>
                  <TableCell>{k.name}</TableCell>
                  <TableCell className="font-mono">
                    {k.prefix}
                    {!k.is_active && <Badge variant="secondary" className="ml-1.5">revoked</Badge>}
                  </TableCell>
                  <TableCell className="font-mono">{k.request_count}</TableCell>
                  <TableCell className="font-mono">{k.last_used_at ? new Date(k.last_used_at + "Z").toLocaleString() : "never"}</TableCell>
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
        )}
        <div className="mt-3 flex items-center gap-2.5 text-[13px] text-muted-foreground">
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
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>Platform request logs</CardTitle>
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
        {logs.loading ? <p className="text-sm text-muted-foreground">Loading…</p> : <LogsTable logs={logs.data?.logs ?? []} showEmail />}
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
  );
}

function System({ getToken }: { getToken: any }) {
  const sys = useAsync(() => platform.adminSystem(getToken));
  if (sys.loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (sys.err || !sys.data) return <p className="text-sm text-muted-foreground">{sys.err || "failed"}</p>;
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
      <Spotlight className="mb-3.5 rounded-lg">
      <Card>
        <CardHeader>
          <CardTitle>System health</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {kv.map(([k, v]) => (
                <TableRow key={k}>
                  <TableHead className="w-44">{k}</TableHead>
                  <TableCell className="font-mono">{v}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </Spotlight>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Spotlight className="rounded-lg">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Rate limits · per minute</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {Object.entries(s.limits_per_min ?? {}).map(([k, v]) => (
                  <TableRow key={k}>
                    <TableHead>{k}</TableHead>
                    <TableCell className="font-mono">{String(v)}</TableCell>
                  </TableRow>
                ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </Spotlight>
          <Spotlight className="rounded-lg">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Quotas · per month</CardTitle>
            </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {Object.entries(s.quotas_monthly ?? {}).map(([k, v]) => (
                  <TableRow key={k}>
                    <TableHead>{k}</TableHead>
                    <TableCell className="font-mono">{String(v)}</TableCell>
                  </TableRow>
                ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </Spotlight>
        </div>
      </>
    );
  }
