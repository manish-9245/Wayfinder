"use client";
import { AlertTriangle, CheckCircle2, OctagonX } from "lucide-react";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { Spotlight } from "@/components/aceternity/spotlight";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const VICON: Record<string, typeof CheckCircle2> = {
  act: CheckCircle2,
  allow: CheckCircle2,
  review: AlertTriangle,
  escalate: OctagonX,
  block: OctagonX,
};

function verdictTone(v: string): "success" | "warning" | "destructive" {
  if (v === "act" || v === "allow") return "success";
  if (v === "block" || v === "escalate") return "destructive";
  return "warning";
}

function Bar({ pct }: { pct: number }) {
  return (
    <Progress
      value={pct}
      role="img"
      aria-label={`${pct.toFixed(1)} percent`}
      className="my-1.5 h-2"
    />
  );
}

export function AnswerCard({ name, a, question }: { name: string; a: any; question?: any }) {
  const rows: React.ReactNode[] = [];
  const legend = (a.legend || {}) as Record<string, string>;
  if (a.probabilities) {
    for (const [l, p] of Object.entries(a.probabilities as Record<string, number>).sort((x, y) => y[1] - x[1])) {
      const label = legend[String(l)] ?? String(l);
      rows.push(
        <div key={l}>
          <div className="mt-2.5 flex items-baseline justify-between gap-3 text-[13px]">
            <code className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs tabular-nums">{label}</code>
            <span className="font-mono tabular-nums text-muted-foreground">{(p * 100).toFixed(1)}%</span>
          </div>
          <Bar pct={p * 100} />
        </div>
      );
    }
  } else if (a.noul != null) {
    rows.push(
      <div key="noul">
        <div className="mt-2.5 flex items-baseline justify-between gap-3 text-[13px]">
          <code className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs tabular-nums">P(true)</code>
          <span className="font-mono tabular-nums text-muted-foreground">{(a.noul * 100).toFixed(1)}%</span>
        </div>
        <Bar pct={a.noul * 100} />
      </div>
    );
  }
  const head = a.choice ? (
    <>
      → <strong>{a.choice}</strong>
    </>
  ) : a.score != null ? (
    <>
      score <strong>{a.score.toFixed(2)}</strong>
    </>
  ) : a.noul != null ? (
    <strong>{(a.noul * 100).toFixed(1)}%</strong>
  ) : null;
  const crit = question?.criteria;
  const described =
    crit && typeof crit === "object" && !Array.isArray(crit)
      ? Object.entries(crit as Record<string, unknown>)
      : [];
  return (
    <Card>
      <Spotlight className="rounded-lg">
      <CardContent className="pt-5">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span>
            <code className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs tabular-nums">{name}</code>{" "}
            <span className="text-[13px] text-muted-foreground">
              {a.type || ""} · conf {a.confidence ?? "n/a"}
            </span>
          </span>
          <span>{head}</span>
        </div>
        {rows}
        {question?.instructions && <p className="mt-2.5 text-[13px] text-muted-foreground">{question.instructions}</p>}
        {described.length > 0 && (
          <ul className="mt-3 grid gap-2 border-t pt-3">
            {described.map(([label, d]) => (
              <li key={label} className="flex items-baseline gap-2.5 text-[13px]">
                <code className="whitespace-nowrap rounded-md border bg-background px-2 py-px font-mono text-xs">{label}</code>
                <span className="text-muted-foreground">{String(d ?? "")}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      </Spotlight>
    </Card>
  );
}

export function VerdictHero({
  verdict,
  count,
}: {
  verdict: { verdict: string; confidence?: number; trigger?: string };
  count: number;
}) {
  const Icon = VICON[verdict.verdict] || AlertTriangle;
  const tone = verdictTone(verdict.verdict);
  const toneText =
    tone === "success" ? "text-primary" : tone === "destructive" ? "text-destructive" : "text-warning";
  return (
    <Card className="relative my-4 overflow-hidden bg-secondary">
      <BackgroundBeams className="opacity-30" />
      <CardContent className="relative flex flex-wrap items-center gap-4 pt-5">
        <span className={cn("grid size-[46px] flex-none place-items-center rounded-full bg-background", toneText)}>
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <span>
          <span className={cn("block text-3xl font-bold leading-none tracking-tight", toneText)}>
            {verdict.verdict}
          </span>
          <span className="mt-1 block text-[13px] text-muted-foreground">
            confidence <strong>{verdict.confidence}</strong> on{" "}
            <code className="font-mono">{verdict.trigger || "none"}</code>
          </span>
          <span className="block text-[13px] text-muted-foreground">{count} question(s) in one forward pass</span>
        </span>
        <Badge variant={tone} className="ml-auto">
          {verdict.verdict}
        </Badge>
      </CardContent>
    </Card>
  );
}
