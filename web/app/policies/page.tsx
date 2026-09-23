"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, toast } from "@/lib/api";
import { PolicyMark } from "@/components/illustrations";

export default function PoliciesPage() {
  useEffect(() => { document.title = "Policies — wayfinder"; }, []);
  const [names, setNames] = useState<Record<string, any>>({});
  const [full, setFull] = useState<Record<string, any>>({});

  useEffect(() => {
    Promise.all([api.policies(), api.policiesFull()])
      .then(([n, f]) => { setNames(n); setFull(f); })
      .catch((e) => toast(e.message));
  }, []);

  return (
    <>
      <div className="console-head"><h1 className="display">Policies.</h1>
        <p className="mut">Questions plus thresholds. Select one to load it in the console.</p></div>
      <div className="polgrid">
        {Object.entries(names).map(([k, p]) => {
          const qs = (full[k]?.questions || {}) as Record<string, any>;
          return (
            <Link key={k} className="card polcard" href={`/console?policy=${k}`} aria-label={`Use policy ${k} in console`}>
              <div className="pol-top"><PolicyMark policy={k} size={44} /><h3>{k}</h3></div>
              <div className="mut">{p.description}</div>
              <div style={{ margin: "10px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(qs).map(([qn, q]) => (
                  <span key={qn} className={`badge t-${q.type}`}>{qn} · {q.type}</span>
                ))}
              </div>
              <div className="mut mono">act ≥ {p.auto_act_above}{p.escalate_below != null ? ` · esc < ${p.escalate_below}` : ""}</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
