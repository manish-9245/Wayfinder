"use client";
import { useEffect, useRef } from "react";
import { CheckCircle, Prohibit, Warning } from "@phosphor-icons/react";

export function CheckIcon() {
  return <CheckCircle size={24} weight="regular" aria-hidden="true" />;
}
export function AlertIcon() {
  return <Warning size={24} weight="regular" aria-hidden="true" />;
}
export function StopIcon() {
  return <Prohibit size={24} weight="regular" aria-hidden="true" />;
}

const VICON: Record<string, () => JSX.Element> = {
  act: CheckIcon, allow: CheckIcon, review: AlertIcon, escalate: StopIcon, block: StopIcon,
};

function Bar({ pct }: { pct: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      f.style.transform = `scaleX(${(pct / 100).toFixed(3)})`;
    }));
    return () => cancelAnimationFrame(raf);
  }, [pct]);
  return (
    <div className="bar" role="img" aria-label={`${pct.toFixed(1)} percent`}>
      <div className="fill" ref={ref} />
    </div>
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
          <div className="prow"><code>{label}</code><span className="pct">{(p * 100).toFixed(1)}%</span></div>
          <Bar pct={p * 100} />
        </div>
      );
    }
  } else if (a.noul != null) {
    rows.push(
      <div key="noul">
        <div className="prow"><code>P(true)</code><span className="pct">{(a.noul * 100).toFixed(1)}%</span></div>
        <Bar pct={a.noul * 100} />
      </div>
    );
  }
  const head = a.choice ? <>→ <strong>{a.choice}</strong></>
    : a.score != null ? <>score <strong>{a.score.toFixed(2)}</strong></>
    : a.noul != null ? <strong>{(a.noul * 100).toFixed(1)}%</strong> : null;
  const crit = question?.criteria;
  const described = crit && typeof crit === "object" && !Array.isArray(crit)
    ? Object.entries(crit as Record<string, unknown>)
    : [];
  return (
    <div className="card">
      <div className="prow" style={{ marginTop: 0 }}>
        <span><code>{name}</code> <span className="mut">{a.type || ""} · conf {a.confidence ?? "n/a"}</span></span>
        <span>{head}</span>
      </div>
      {rows}
      {question?.instructions && <div className="mut" style={{ marginTop: 10 }}>{question.instructions}</div>}
      {described.length > 0 && (
        <ul className="legend-list">
          {described.map(([label, d]) => (
            <li key={label}><code>{label}</code><span>{String(d ?? "")}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function VerdictHero({ verdict, count }: { verdict: { verdict: string; confidence?: number; trigger?: string }; count: number }) {
  const Icon = VICON[verdict.verdict] || AlertIcon;
  return (
    <div className={`verdict vd-${verdict.verdict}`}>
      <div className="mark"><Icon /></div>
      <div>
        <div className="v">{verdict.verdict}</div>
        <div><small>confidence <strong>{verdict.confidence}</strong> on <code className="mono">{verdict.trigger || "none"}</code></small></div>
        <div className="mut">{count} question(s) in one forward pass</div>
      </div>
    </div>
  );
}
