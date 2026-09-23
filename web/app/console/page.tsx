"use client";
import { useCallback, useEffect, useState } from "react";
import { api, toast, type DecideResult } from "@/lib/api";
import { EXAMPLES } from "@/lib/examples";
import { AnswerCard, VerdictHero } from "@/components/Verdict";
import { PolicyMark } from "@/components/illustrations";
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
      <div className="console-head"><h1 className="display">Console.</h1>
        <p className="mut">A live workbench for the doubt layer. Pick a policy, load a hard case or paste your own state, and read the verdict the same way your code would. Every answer carries a calibrated confidence, and thresholds decide what acts alone. See <Link href="/docs">docs</Link> for the API behind this screen.</p></div>
      <div className="polgrid" style={{ marginBottom: 14 }}>
        {Object.entries(POLICY_CONTEXT).map(([k, c]) => (
          <div key={k} className="card" style={{ margin: 0 }}>
            <div className="pol-top"><PolicyMark policy={k} size={36} /><h3>{k.replace(/_/g, " ")}</h3></div>
            <div className="mut"><strong>Use it to</strong> {c.use}</div>
            <div className="mut" style={{ marginTop: 6 }}><strong>Read it as</strong> {c.reads}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <span className="lbl" id="pollbl">Policy</span>
        <div className="pills" id="pills" role="group" aria-labelledby="pollbl">
          {Object.keys(policies).map((k) => (
            <button key={k} type="button" className="pill" aria-pressed={policy === k} onClick={() => setPolicy(k)}>{k}</button>
          ))}
        </div>
        {desc && <div className="mut" role="status">{desc.description} · act ≥ {desc.auto_act_above}{desc.escalate_below != null ? ` · escalate < ${desc.escalate_below}` : ""}</div>}
      </div>
      <div className="card">
        <span className="lbl" id="exlbl">Dense examples: load a hard case</span>
        <div className="pills" role="group" aria-labelledby="exlbl">
          {EXAMPLES.map((ex) => (
            <button key={ex.label} type="button" className="pill"
              aria-pressed={false}
              title={ex.note}
              onClick={() => {
                setPolicy(ex.policy);
                setState(typeof ex.state === "string" ? ex.state : JSON.stringify(ex.state, null, 2));
                setOpts(JSON.stringify(ex.options || { model: null }, null, 2));
                setRes(null); setMeta("");
              }}>
              {ex.label}
            </button>
          ))}
        </div>
        <div className="mut">Each loads a full record plus the options it needs. Hover a chip for why it is tricky. Press <kbd>⌘↵</kbd> to send.</div>
      </div>
      <div className="grid2">
        <div className="card">
          <label className="lbl" htmlFor="state">State: JSON object or plain text</label>
          <textarea id="state" rows={9} value={state} onChange={(e) => setState(e.target.value)} aria-describedby="state-hint" />
          <div className="mut" id="state-hint">A JSON object of fields, or plain text (sent as-is).</div>
          {stateErr && <div className="field-err" role="alert">{stateErr}</div>}
        </div>
        <div className="card">
          <label className="lbl" htmlFor="opts">Options: model pin and threshold overrides (JSON)</label>
          <textarea id="opts" rows={9} value={opts} onChange={(e) => setOpts(e.target.value)} aria-describedby="opts-hint" />
          <div className="mut" id="opts-hint">e.g. <code className="mono">{'{"model":"multilingual","auto_act_above":0.9}'}</code> · omit to auto-route by language.</div>
          {optsErr && <div className="field-err" role="alert">{optsErr}</div>}
        </div>
      </div>
      <p><button className="primary" onClick={send} disabled={busy || !policy} aria-busy={busy}>
        {busy ? <><span className="spinner" aria-hidden="true" />&nbsp;Deciding…</> : "Decide"}</button>{" "}
        <span className="mut" id="meta" role="status">{meta}</span></p>
      {busy && <div className="skel" aria-hidden="true"><div className="ln" style={{ width: "38%" }} /><div className="ln" /><div className="ln" style={{ width: "72%" }} /></div>}
      {res && (
        <>
          <VerdictHero verdict={res.verdict || { verdict: "review" }} count={Object.keys(res.answers || {}).length} />
          {Object.entries(res.answers || {}).map(([k, a], i) => (
            <div key={k} className="rise" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
              <AnswerCard name={k} a={a} question={policies[policy]?.questions?.[k]} />
            </div>
          ))}
          <div className="card"><span className="lbl">Raw response</span><pre className="raw" tabIndex={0}>{JSON.stringify(res, null, 2)}</pre></div>
        </>
      )}
    </>
  );
}
