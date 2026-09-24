"use client";
import { useCallback, useEffect, useState } from "react";
import { api, toast, type DecideResult } from "@/lib/api";
import { EXAMPLES } from "@/lib/examples";
import { AnswerCard, VerdictHero } from "@/components/Verdict";
import { Spotlight } from "@/components/aceternity/spotlight";
import { PolicyMark } from "@/components/illustrations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import Link from "next/link";

const POLICY_CONTEXT: Record<string, { use: string; reads: string }> = {
  support_inbound: {
    use: "Route tickets, emails, and messages. Best for support ops triaging mixed-language queues.",
    reads: "Act means auto-route. Review means a human should glance first. Escalate means low confidence or churn risk.",
  },
  llm_firewall: {
    use: "Screen prompts before they reach your model. Best for chat products, copilots, and agents with tool access.",
    reads: "Allow means clean. Review means suspicious. Block means jailbreak, injection, or leak risk at or above your threshold.",
  },
  model_router: {
    use: "Spend frontier-model money only where it matters. Best for gateways sitting in front of two model tiers.",
    reads: "Small means cheap and safe. Frontier means complex or high stakes. Human means do not automate this one.",
  },
  content_safety: {
    use: "Score user posts and uploads. Best for communities, marketplaces, and UGC feeds.",
    reads: "Allow means publish. Review means queue for a moderator. Block means toxic or threatening content.",
  },
};

export default function ConsolePage() {
  useEffect(() => { document.title = "Console — wayfinder"; }, []);
  const [policies, setPolicies] = useState<Record<string, any>>({});
  const [policy, setPolicy] = useState("");
  const [state, setState] = useState('{"body": "We were billed twice for March. Please refund it today or we cancel."}');
  const [opts, setOpts] = useState('{"model": null}');
  const [stateErr, setStateErr] = useState("");
  const [optsErr, setOptsErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState("");
  const [res, setRes] = useState<DecideResult | null>(null);

  useEffect(() => {
    api.policiesFull().then((p) => {
      setPolicies(p);
      const q = new URLSearchParams(window.location.search).get("policy");
      const first = Object.keys(p)[0];
      const pick = q && p[q] ? q : first;
      setPolicy(pick);
    }).catch((e) => toast(e.message));
  }, []);

  const send = useCallback(async () => {
    setStateErr(""); setOptsErr("");
    let st: unknown;
    try { st = JSON.parse(state); }
    catch {
      if (!state.trim()) { setStateErr("State must not be empty. Paste text or JSON."); return; }
      st = state;
    }
    if (typeof st === "object" && st !== null && !Object.keys(st).length) { setStateErr("State must not be empty."); return; }
    let o: Record<string, any> = {};
    try { o = JSON.parse(opts || "{}"); }
    catch { setOptsErr("Options is not valid JSON. It must be an object like {}."); return; }
    setBusy(true); setRes(null);
    const t0 = performance.now();
    try {
      const j = await api.decide(policy, st, o);
      setRes(j);
      const ms = (performance.now() - t0).toFixed(0);
      setMeta(`${ms}ms, cache ${j.cache_hit ? "hit" : "miss"}. Routed ${j.routing?.model || "auto"}: ${j.routing?.reason || "language auto-detect"}`);
    } catch (e: any) { toast(e.message); }
    finally { setBusy(false); }
  }, [policy, state, opts]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [send]);

  const desc = policies[policy];
  return (
    <>
      <div className="mb-4 mt-6">
        <h1 className="text-4xl font-bold tracking-tight">Console.</h1>
        <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
          A live workbench for the doubt layer. Pick a policy, load a hard case or paste your own state, and read the
          verdict the same way your code would. Every answer carries a calibrated confidence, and thresholds decide
          what acts alone. See <Link href="/docs" className="text-info hover:underline">docs</Link> for the API behind
          this screen.
        </p>
      </div>
      <div className="mb-3.5 grid gap-3.5 sm:grid-cols-2">
        {Object.entries(POLICY_CONTEXT).map(([k, c]) => (
          <Spotlight key={k} className="rounded-lg">
          <Card className="h-full">
            <CardHeader className="flex-row items-center gap-3.5 space-y-0">
              <span className="grid size-9 shrink-0 place-items-center text-muted-foreground [&_svg]:size-full">
                <PolicyMark policy={k} size={36} />
              </span>
              <CardTitle className="capitalize">{k.replace(/_/g, " ")}</CardTitle>
            </CardHeader>
            <CardContent className="text-[13px] text-muted-foreground">
              <p><strong className="text-foreground">Use it to</strong> {c.use}</p>
              <p className="mt-1.5"><strong className="text-foreground">Read it as</strong> {c.reads}</p>
            </CardContent>
          </Card>
          </Spotlight>
        ))}
      </div>
      <Card className="mb-3.5">
        <CardContent className="pt-5">
          <Label id="pollbl">Policy</Label>
          <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-labelledby="pollbl">
            {Object.keys(policies).map((k) => (
              <Button
                key={k}
                type="button"
                variant={policy === k ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                aria-pressed={policy === k}
                onClick={() => setPolicy(k)}
              >
                {k}
              </Button>
            ))}
          </div>
          {desc && (
            <CardDescription className="mt-2" role="status">
              {desc.description} · act ≥ {desc.auto_act_above}
              {desc.escalate_below != null ? ` · escalate < ${desc.escalate_below}` : ""}
            </CardDescription>
          )}
        </CardContent>
      </Card>
      <Card className="mb-3.5">
        <CardContent className="pt-5">
          <Label id="exlbl">Dense examples: load a hard case</Label>
          <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-labelledby="exlbl">
            {EXAMPLES.map((ex) => (
              <Button
                key={ex.label}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                title={ex.note}
                onClick={() => {
                  setPolicy(ex.policy);
                  setState(typeof ex.state === "string" ? ex.state : JSON.stringify(ex.state, null, 2));
                  setOpts(JSON.stringify(ex.options || { model: null }, null, 2));
                  setRes(null); setMeta("");
                }}
              >
                {ex.label}
              </Button>
            ))}
          </div>
          <CardDescription className="mt-2">
            Each loads a full record plus the options it needs. Hover a chip for why it is tricky. Press{" "}
            <kbd className="rounded border border-b-2 bg-muted px-1.5 py-px font-mono text-[11px]">⌘↵</kbd> to send.
          </CardDescription>
        </CardContent>
      </Card>
      <div className="grid gap-3.5 md:grid-cols-2">
        <Spotlight className="rounded-lg">
        <Card className="h-full">
          <CardContent className="pt-5">
            <Label htmlFor="state">State: JSON object or plain text</Label>
            <Textarea id="state" rows={9} value={state} onChange={(e) => setState(e.target.value)} aria-describedby="state-hint" className="mt-2" />
            <CardDescription className="mt-1.5" id="state-hint">A JSON object of fields, or plain text (sent as-is).</CardDescription>
            {stateErr && (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription role="alert">{stateErr}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
        </Spotlight>
        <Spotlight className="rounded-lg">
        <Card className="h-full">
          <CardContent className="pt-5">
            <Label htmlFor="opts">Options: model pin and threshold overrides (JSON)</Label>
            <Textarea id="opts" rows={9} value={opts} onChange={(e) => setOpts(e.target.value)} aria-describedby="opts-hint" className="mt-2" />
            <CardDescription className="mt-1.5" id="opts-hint">
              e.g. <code className="rounded border bg-background px-1.5 py-px font-mono text-xs">{'{"model":"multilingual","auto_act_above":0.9}'}</code> · omit to auto-route by language.
            </CardDescription>
            {optsErr && (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription role="alert">{optsErr}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
        </Spotlight>
      </div>
      <p className="my-4 flex flex-wrap items-center gap-3">
        <Button onClick={send} disabled={busy || !policy} aria-busy={busy}>
          {busy && <Loader2 aria-hidden="true" className="animate-spin" />}Decide
        </Button>
        <span className="text-[13px] text-muted-foreground" id="meta" role="status">{meta}</span>
      </p>
      {busy && (
        <Card className="my-4" aria-hidden="true">
          <CardContent className="space-y-2.5 pt-5">
            <Skeleton className="h-3.5 w-[38%]" />
            <Skeleton className="h-3.5" />
            <Skeleton className="h-3.5 w-[72%]" />
          </CardContent>
        </Card>
      )}
      {res && (
        <div className="grid gap-3.5">
          <VerdictHero verdict={res.verdict || { verdict: "review" }} count={Object.keys(res.answers || {}).length} />
          {Object.entries(res.answers || {}).map(([k, a], i) => (
            <div key={k} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
              <AnswerCard name={k} a={a} question={policies[policy]?.questions?.[k]} />
            </div>
          ))}
          <Card>
            <CardContent className="pt-5">
              <Label>Raw response</Label>
              <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-3.5 font-mono text-xs leading-6" tabIndex={0}>
                {JSON.stringify(res, null, 2)}
              </pre>
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">cache {res.cache_hit ? "hit" : "miss"}</Badge>
            {res.policy && <Badge variant="outline">{res.policy}</Badge>}
          </div>
        </div>
      )}
    </>
  );
}
