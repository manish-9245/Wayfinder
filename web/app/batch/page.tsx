"use client";
import { Fragment, useEffect, useState } from "react";
import { api, toast, topOf, verdictOf, type DecideResult } from "@/lib/api";
import { SAMPLE_BATCH } from "@/lib/examples";
import { EmptyBox } from "@/components/illustrations";
import { Doubtling } from "@/components/mascots";
import { AnswerCard, VerdictHero } from "@/components/Verdict";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JsonInput } from "@/components/json-input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function BatchPage() {
  useEffect(() => { document.title = "Batch scoring — wayfinder"; }, []);
  const [policies, setPolicies] = useState<string[]>([]);
  const [full, setFull] = useState<Record<string, any>>({});
  const [policy, setPolicy] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [text, setText] = useState('{"body": "Refund invoice 4411 please"}\n{"body": "The API returns 500 on every deploy"}\n{"body": "मुझसे दो बार शुल्क लिया गया"}');
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState("");
  const [rows, setRows] = useState<{ state: unknown; res: DecideResult }[]>([]);

  useEffect(() => {
    api.policiesFull().then((p) => {
      const ks = Object.keys(p);
      setPolicies(ks); setPolicy(ks[0]); setFull(p);
    }).catch((e) => toast(e.message));
  }, []);

  const send = async () => {
    setErr("");
    const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
    const states: unknown[] = [];
    for (const [i, l] of lines.entries()) {
      try { states.push(JSON.parse(l)); }
      catch { setErr(`Line ${i + 1} is not valid JSON. Every line must be one object.`); return; }
    }
    if (!states.length) { setErr("Add at least one state (one JSON object per line)."); return; }
    setBusy(true);
    const t0 = performance.now();
    try {
      const j = await api.batch(states, policy);
      setMeta(`${j.count} states in ${(performance.now() - t0).toFixed(0)}ms`);
      setRows(j.results.map((res, i) => ({ state: states[i], res })));
    } catch (e: any) { toast(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="mb-8 mt-6">
        <p className="eyebrow">Wayfinder — batch scoring</p>
        <h1 className="mt-2 font-tsj-display text-4xl font-bold tracking-tight md:text-5xl">Batch</h1>
        <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
          Score up to 128 states against one policy in shared forward passes. Built for backlogs, queues, and feeds:
          compatible states share the GPU batch at about 1ms per decision. Expand any row for full answers.
        </p>
      </div>

      <section aria-label="Policy" className="mb-10">
        <div className="mb-3 flex items-baseline gap-4">
          <span className="section-num">01</span>
          <h2 className="font-tsj-display text-xl font-bold tracking-tight">Policy</h2>
        </div>
        <div className="hairline-t" role="group" aria-label="Policy">
          {policies.map((k, i) => (
            <button
              key={k}
              type="button"
              aria-pressed={policy === k}
              onClick={() => setPolicy(k)}
              className={cn(
                "hairline-b grid w-full grid-cols-[auto_1fr] items-baseline gap-x-4 px-1 py-3 text-left transition-colors hover:bg-accent/40",
                policy === k && "bg-accent/40"
              )}
            >
              <span className={cn("section-num", policy !== k && "text-muted-foreground")}>{String(i + 1).padStart(2, "0")}</span>
              <span className={cn("font-tsj-mono text-sm font-semibold", policy === k && "text-ember")}>{k}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="States" className="mb-10">
        <div className="mb-3 flex items-baseline gap-4">
          <span className="section-num">02</span>
          <h2 className="font-tsj-display text-xl font-bold tracking-tight">States</h2>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="bstates" className="font-tsj-mono text-[11px] uppercase tracking-[0.14em]">One JSON object per line</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 font-tsj-mono text-[11px]"
            onClick={() => {
              const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
              try {
                setText(lines.map((l) => JSON.stringify(JSON.parse(l))).join("\n"));
                setErr("");
              } catch {
                setErr("One of the lines is not valid JSON — nothing tidied.");
              }
            }}
          >
            Tidy lines
          </Button>
        </div>
        <JsonInput id="bstates" rows={7} value={text} onChange={setText} className="mt-2" />
        {err && (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription role="alert">{err}</AlertDescription>
          </Alert>
        )}
        <p className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={send} disabled={busy || !policy} aria-busy={busy}>
            {busy && <Loader2 aria-hidden="true" className="animate-spin" />}Score batch
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              setText(SAMPLE_BATCH.map((r) => JSON.stringify(r.state)).join("\n"));
              setRows([]); setMeta("");
            }}
          >
            Load dense sample
          </Button>
          <span className="font-tsj-mono text-xs text-muted-foreground" role="status">{meta}</span>
        </p>
      </section>

      {rows.length > 0 ? (
        <section aria-label="Results">
          <div className="mb-3 flex items-baseline gap-4">
            <span className="section-num">03</span>
            <h2 className="font-tsj-display text-xl font-bold tracking-tight">Results</h2>
          </div>
          <div className="mb-3 flex flex-wrap gap-4 font-tsj-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground" aria-label="Verdict legend">
            <span className="inline-flex items-center gap-1.5">
              <Badge variant="success">act / allow</Badge>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Badge variant="warning">review</Badge>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Badge variant="destructive">escalate / block</Badge>
            </span>
          </div>
          <div className="hairline-t overflow-x-auto">
            <Table aria-label="Batch decision results">
              <TableHeader>
                <TableRow>
                  <TableHead className="font-tsj-mono text-[11px] uppercase tracking-[0.14em]">#</TableHead>
                  <TableHead className="font-tsj-mono text-[11px] uppercase tracking-[0.14em]">state</TableHead>
                  <TableHead className="font-tsj-mono text-[11px] uppercase tracking-[0.14em]">verdict</TableHead>
                  <TableHead className="font-tsj-mono text-[11px] uppercase tracking-[0.14em]">top answer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ state, res }, i) => {
                  const v = verdictOf(res);
                  const isOpen = expanded === i;
                  const tone = v === "act" || v === "allow" ? "success" : v === "block" || v === "escalate" ? "destructive" : "warning";
                  return (
                    <Fragment key={i}>
                      <TableRow>
                        <TableCell className="font-tsj-mono">{i + 1}</TableCell>
                        <TableCell className="font-tsj-mono">{JSON.stringify(state).slice(0, 80)}</TableCell>
                        <TableCell>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={tone}>{v}</Badge>
                            {res.cache_hit && <Badge variant="secondary">cached</Badge>}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="mr-2 font-tsj-grot">{topOf(res)}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "Hide" : "Show"} full answers for row ${i + 1}`}
                            onClick={() => setExpanded(isOpen ? null : i)}
                          >
                            {isOpen ? "Hide" : "Details"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <Separator className="mb-3" />
                            <VerdictHero verdict={res.verdict || { verdict: "review" }} count={Object.keys(res.answers || {}).length} />
                            <div className="grid gap-6">
                              {Object.entries(res.answers || {}).map(([k, a]) => (
                                <AnswerCard key={k} name={k} a={a} question={full[policy]?.questions?.[k]} />
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <CardDescription className="mt-2 font-tsj-mono text-xs">One row per scored state, with its verdict and top answer.</CardDescription>
        </section>
      ) : (
        !busy && (
          <Card aria-label="No batch results yet">
            <CardContent className="grid place-items-center gap-2 px-5 py-10 text-center text-muted-foreground">
              <div aria-hidden="true" className="mascot-bob text-muted-foreground/80">
                <Doubtling size={76} mood="sleepy" />
              </div>
              <div className="size-[88px] opacity-80">
                <EmptyBox />
              </div>
              <p className="eyebrow">No batch yet</p>
              <p className="max-w-[44ch] text-sm">
                Paste one JSON state per line above and score them together.
              </p>
            </CardContent>
          </Card>
        )
      )}
    </>
  );
}
