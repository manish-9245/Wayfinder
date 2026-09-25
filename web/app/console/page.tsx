"use client";
import { useCallback, useEffect, useState } from "react";
import { api, toast, type DecideResult } from "@/lib/api";
import { EXAMPLES } from "@/lib/examples";
import { AnswerCard, VerdictHero } from "@/components/Verdict";
import { JsonBlock } from "@/components/json-block";
import { JsonInput } from "@/components/json-input";
import { PolicyMark } from "@/components/illustrations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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

function SectionNum({ n, title, hint }: { n: string; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-4">
      <span className="section-num">{n}</span>
      <h2 className="font-tsj-display text-xl font-bold tracking-tight">{title}</h2>
      {hint && <span className="ml-auto hidden font-tsj-mono text-[11px] text-muted-foreground sm:block">{hint}</span>}
    </div>
  );
}

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

  const formatJson = (raw: string, set: (v: string) => void, what: string) => {
    try {
      set(JSON.stringify(JSON.parse(raw), null, 2));
    } catch {
      toast(`${what} is not valid JSON — nothing formatted`);
    }
  };

  const desc = policies[policy];
  return (
    <>
      <div className="mb-8 mt-6">
        <p className="eyebrow">Wayfinder — live workbench</p>
        <h1 className="mt-2 font-tsj-display text-4xl font-bold tracking-tight md:text-5xl">Console</h1>
        <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
          A live workbench for the doubt layer. Pick a policy, load a hard case or paste your own state, and read the
          verdict the same way your code would. Every answer carries a calibrated confidence, and thresholds decide
          what acts alone. See <Link href="/docs" className="text-info hover:underline">docs</Link> for the API behind
          this screen.
        </p>
      </div>

      <section aria-labelledby="console-policy" className="mb-10">
        <SectionNum n="01" title="Policy" hint={desc ? `act ≥ ${desc.auto_act_above}${desc.escalate_below != null ? ` · escalate < ${desc.escalate_below}` : ""}` : undefined} />
        <div id="console-policy" className="hairline-t" role="group" aria-label="Policy">
          {Object.entries(POLICY_CONTEXT).map(([k, c], i) => (
            <button
              key={k}
              type="button"
              aria-pressed={policy === k}
              onClick={() => setPolicy(k)}
              className={cn(
                "hairline-b grid w-full grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 px-1 py-4 text-left transition-colors hover:bg-accent/40",
                policy === k && "bg-accent/40"
              )}
            >
              <span className="flex items-center gap-3">
                <span className={cn("section-num", policy !== k && "text-muted-foreground")}>{String(i + 1).padStart(2, "0")}</span>
                <span className="grid size-8 place-items-center text-muted-foreground [&_svg]:size-full">
                  <PolicyMark policy={k} size={32} />
                </span>
              </span>
              <span>
                <span className={cn("font-tsj-mono text-sm font-semibold", policy === k && "text-ember")}>{k}</span>
                <span className="mt-1 block text-[13px] text-muted-foreground"><strong className="font-semibold text-foreground">Use it to</strong> {c.use}</span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground"><strong className="font-semibold text-foreground">Read it as</strong> {c.reads}</span>
              </span>
            </button>
          ))}
        </div>
        {desc && (
          <p className="mt-2 font-tsj-mono text-xs text-muted-foreground" role="status">
            {desc.description} · act ≥ {desc.auto_act_above}
            {desc.escalate_below != null ? ` · escalate < ${desc.escalate_below}` : ""}
          </p>
        )}
      </section>

      <section aria-labelledby="console-examples" className="mb-10">
        <SectionNum n="02" title="Hard cases" hint="⌘↵ sends" />
        <div id="console-examples" className="hairline-t" role="group" aria-label="Dense examples: load a hard case">
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.label}
              type="button"
              title={ex.note}
              onClick={() => {
                setPolicy(ex.policy);
                setState(typeof ex.state === "string" ? ex.state : JSON.stringify(ex.state, null, 2));
                setOpts(JSON.stringify(ex.options || { model: null }, null, 2));
                setRes(null); setMeta("");
              }}
              className="hairline-b grid w-full grid-cols-[auto_1fr] items-baseline gap-x-4 px-1 py-3 text-left transition-colors hover:bg-accent/40"
            >
              <span className="section-num text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="font-tsj-grot text-[15px] font-semibold">{ex.label}</span>
                <span className="ml-2 font-tsj-mono text-[11px] text-muted-foreground">{ex.policy}</span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">{ex.note}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="State and options" className="mb-6">
        <SectionNum n="03" title="State & options" />
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="state" className="font-tsj-mono text-[11px] uppercase tracking-[0.14em]">State — JSON object or plain text</Label>
              <Button type="button" variant="ghost" size="sm" className="h-auto px-2 py-1 font-tsj-mono text-[11px]" onClick={() => formatJson(state, setState, "State")}>
                Format JSON
              </Button>
            </div>
            <JsonInput id="state" rows={9} value={state} onChange={setState} ariaDescribedBy="state-hint" className="mt-2" />
            <CardDescription className="mt-1.5 font-tsj-mono text-xs" id="state-hint">A JSON object of fields, or plain text (sent as-is).</CardDescription>
            {stateErr && (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription role="alert">{stateErr}</AlertDescription>
              </Alert>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="opts" className="font-tsj-mono text-[11px] uppercase tracking-[0.14em]">Options — model pin / threshold overrides</Label>
              <Button type="button" variant="ghost" size="sm" className="h-auto px-2 py-1 font-tsj-mono text-[11px]" onClick={() => formatJson(opts, setOpts, "Options")}>
                Format JSON
              </Button>
            </div>
            <JsonInput id="opts" rows={9} value={opts} onChange={setOpts} ariaDescribedBy="opts-hint" className="mt-2" />
            <CardDescription className="mt-1.5 font-tsj-mono text-xs" id="opts-hint">
              e.g. <code className="rounded border bg-background px-1.5 py-px font-tsj-mono text-xs">{'{"model":"multilingual","auto_act_above":0.9}'}</code> · omit to auto-route by language.
            </CardDescription>
            {optsErr && (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription role="alert">{optsErr}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>
        <p className="hairline-t my-6 flex flex-wrap items-center gap-4 pt-6">
          <Button size="lg" onClick={send} disabled={busy || !policy} aria-busy={busy}>
            {busy && <Loader2 aria-hidden="true" className="animate-spin" />}Decide
          </Button>
          <span className="font-tsj-mono text-xs text-muted-foreground" id="meta" role="status">{meta}</span>
        </p>
      </section>

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
        <section aria-label="Decision result" className="grid gap-6">
          <div>
            <SectionNum n="04" title="Verdict" />
            <VerdictHero verdict={res.verdict || { verdict: "review" }} count={Object.keys(res.answers || {}).length} />
          </div>
          {Object.entries(res.answers || {}).map(([k, a], i) => (
            <div key={k} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
              <AnswerCard name={k} a={a} question={policies[policy]?.questions?.[k]} />
            </div>
          ))}
          <JsonBlock label="Raw response" data={res} />
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">cache {res.cache_hit ? "hit" : "miss"}</Badge>
            {res.policy && <Badge variant="outline">{res.policy}</Badge>}
          </div>
        </section>
      )}
    </>
  );
}
