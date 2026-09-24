"use client";
import { Fragment, useEffect, useState } from "react";
import { api, toast, topOf, verdictOf, type DecideResult } from "@/lib/api";
import { SAMPLE_BATCH } from "@/lib/examples";
import { EmptyBox } from "@/components/illustrations";
import { AnswerCard, VerdictHero } from "@/components/Verdict";
import { Spotlight } from "@/components/aceternity/spotlight";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

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
      <div className="mb-4 mt-6">
        <h1 className="text-4xl font-bold tracking-tight">Batch.</h1>
        <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
          Score up to 128 states against one policy in shared forward passes. Built for backlogs, queues, and feeds:
          compatible states share the GPU batch at about 1ms per decision. Expand any row for full answers.
        </p>
      </div>
      <Card className="mb-3.5">
        <CardContent className="pt-5">
          <Label>Policy</Label>
          <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Policy">
            {policies.map((k) => (
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
        </CardContent>
      </Card>
      <Card className="mb-3.5">
        <CardContent className="pt-5">
          <Label htmlFor="bstates">States: one JSON object per line</Label>
          <Textarea id="bstates" rows={7} value={text} onChange={(e) => setText(e.target.value)} className="mt-2" />
          {err && (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription role="alert">{err}</AlertDescription>
            </Alert>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={send} disabled={busy || !policy} aria-busy={busy}>
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
            <span className="text-[13px] text-muted-foreground" role="status">{meta}</span>
          </p>
        </CardContent>
      </Card>
      {rows.length > 0 ? (
        <Card>
          <CardContent className="pt-5">
            <Label>Results</Label>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Verdict legend">
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
            <div className="mt-3">
              <Table aria-label="Batch decision results">
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>state</TableHead>
                    <TableHead>verdict</TableHead>
                    <TableHead>top answer</TableHead>
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
                          <TableCell>{i + 1}</TableCell>
                          <TableCell className="font-mono">{JSON.stringify(state).slice(0, 80)}</TableCell>
                          <TableCell>
                            <span className="flex flex-wrap items-center gap-1.5">
                              <Badge variant={tone}>{v}</Badge>
                              {res.cache_hit && <Badge variant="secondary">cached</Badge>}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="mr-2">{topOf(res)}</span>
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
                              <div className="grid gap-3.5">
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
            <CardDescription className="mt-2">One row per scored state, with its verdict and top answer.</CardDescription>
          </CardContent>
        </Card>
      ) : (
        !busy && (
          <Spotlight className="rounded-lg">
          <Card aria-label="No batch results yet" className="h-full">
            <CardContent className="grid place-items-center gap-2 px-5 py-10 text-center text-muted-foreground">
              <div className="size-[88px] opacity-80">
                <EmptyBox />
              </div>
              <p className="max-w-[44ch] text-sm">
                <strong className="text-foreground">No batch yet.</strong> Paste one JSON state per line above and score
                them together.
              </p>
            </CardContent>
          </Card>
          </Spotlight>
        )
      )}
    </>
  );
}
