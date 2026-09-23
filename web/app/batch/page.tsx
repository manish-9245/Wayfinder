"use client";
import { Fragment, useEffect, useState } from "react";
import { api, toast, topOf, verdictOf, type DecideResult } from "@/lib/api";
import { SAMPLE_BATCH } from "@/lib/examples";
import { EmptyBox } from "@/components/illustrations";
import { AnswerCard, VerdictHero } from "@/components/Verdict";

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
      <div className="console-head"><h1 className="display">Batch.</h1>
        <p className="mut">Score up to 128 states against one policy in shared forward passes. Built for backlogs, queues, and feeds: compatible states share the GPU batch at about 1ms per decision. Expand any row for full answers.</p></div>
      <div className="card">
        <span className="lbl">Policy</span>
        <div className="pills" role="group" aria-label="Policy">
          {policies.map((k) => (
            <button key={k} type="button" className="pill" aria-pressed={policy === k} onClick={() => setPolicy(k)}>{k}</button>
          ))}
        </div>
      </div>
      <div className="card">
        <label className="lbl" htmlFor="bstates">States: one JSON object per line</label>
        <textarea id="bstates" rows={7} value={text} onChange={(e) => setText(e.target.value)} />
        {err && <div className="field-err" role="alert">{err}</div>}
        <p><button className="primary" onClick={send} disabled={busy || !policy} aria-busy={busy}>
          {busy ? <><span className="spinner" aria-hidden="true" />&nbsp;Scoring…</> : "Score batch"}</button>{" "}
        <button className="ghost" type="button" onClick={() => {
          setText(SAMPLE_BATCH.map((r) => JSON.stringify(r.state)).join("\n"));
          setRows([]); setMeta("");
        }}>Load dense sample</button>{" "}
        <span className="mut" role="status">{meta}</span></p>
      </div>
      {rows.length > 0 ? (
        <div className="card"><span className="lbl">Results</span>
          <div className="legend" aria-label="Verdict legend">
            <span><i className="swatch" style={{ background: "var(--color-accent)" }} />act / allow</span>
            <span><i className="swatch" style={{ background: "var(--color-warn)" }} />review</span>
            <span><i className="swatch" style={{ background: "var(--color-bad)" }} />escalate / block</span>
          </div>
          <div className="res-wrap"><table className="res" aria-label="Batch decision results">
            <caption className="mut" style={{ textAlign: "left", paddingBottom: 8 }}>One row per scored state, with its verdict and top answer.</caption>
            <thead><tr><th scope="col">#</th><th scope="col">state</th><th scope="col">verdict</th><th scope="col">top answer</th></tr></thead>
            <tbody>
              {rows.map(({ state, res }, i) => {
                const v = verdictOf(res);
                const isOpen = expanded === i;
                return (
                  <Fragment key={i}>
                    <tr key={`r${i}`}>
                      <td>{i + 1}</td>
                      <td className="mono">{JSON.stringify(state).slice(0, 80)}</td>
                      <td className={`vd-${v}`}><strong>{v}</strong>{res.cache_hit ? ' <span className="mut">cached</span>' : null}</td>
                      <td>{topOf(res)}{" "}
                        <button type="button" className="ghost" style={{ padding: "6px 12px", minHeight: 36 }}
                          aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} full answers for row ${i + 1}`}
                          onClick={() => setExpanded(isOpen ? null : i)}>
                          {isOpen ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`d${i}`}>
                        <td colSpan={4} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <VerdictHero verdict={res.verdict || { verdict: "review" }} count={Object.keys(res.answers || {}).length} />
                          {Object.entries(res.answers || {}).map(([k, a]) => (
                            <AnswerCard key={k} name={k} a={a} question={full[policy]?.questions?.[k]} />
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table></div>
        </div>
      ) : (
        !busy && (
          <div className="card empty" aria-label="No batch results yet">
            <EmptyBox />
            <p><strong>No batch yet.</strong> Paste one JSON state per line above and score them together.</p>
          </div>
        )
      )}
    </>
  );
}
