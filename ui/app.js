/* wayfinder SPA — vanilla JS, no build step.
   Conventions: tabs use roving tabindex + arrow keys; verdicts pair icon with
   text (never color alone); bars animate via transform scaleX. */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let POLICIES = {}, FULL = {};
const DOCS = [
  ["API", "API.md"], ["Policies", "POLICIES.md"], ["MCP", "MCP.md"],
  ["Architecture", "ARCHITECTURE.md"], ["Deploy", "DEPLOY.md"],
];
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5.5"/>',
  alert: '<path d="M12 3.5L22 20H2z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  stop: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  err: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>',
};
const svg = (n, size) => `<svg ${size?`width="${size}" height="${size}"`:""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ---------- theme (dark default per design system) ---------- */
function setTheme(t){
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]').content = t === "dark" ? "#0F172A" : "#F1F5F9";
  try{ localStorage.setItem("wayfinder.theme", t); }catch{}
  $("#theme-icon").innerHTML = ICONS[t === "dark" ? "moon" : "sun"];
  $("#theme-label").textContent = t;
}
setTheme((()=>{ try{ return localStorage.getItem("wayfinder.theme") || "dark"; }catch{ return "dark"; } })());
$("#theme").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

/* ---------- tabs: roving tabindex, arrow keys, deep links ---------- */
const TABS = ["home","play","batch","policies","docs","metrics"];
let metricsTimer = null;
function show(t, focusMain){
  if(!TABS.includes(t)) t = "play";
  TABS.forEach(x => {
    $("#v-"+x).hidden = x !== t;
    const b = $(`#tabs button[data-t="${x}"]`);
    b.setAttribute("aria-selected", x === t ? "true" : "false");
    b.tabIndex = x === t ? 0 : -1;
  });
  if(location.hash !== "#/"+t) location.hash = "#/"+t;
  if(focusMain) $("#main").focus({preventScroll:true});
  window.scrollTo({top:0});
  clearInterval(metricsTimer);
  if(t === "docs" && !$("#docbody").dataset.loaded) loadDoc(DOCS[0][1]);
  if(t === "metrics"){ refreshMetrics(); metricsTimer = setInterval(refreshMetrics, 3000); }
  if(t === "home") requestAnimationFrame(initLandingMotion);
}
$$("#tabs button").forEach((b,i) => {
  b.onclick = () => show(b.dataset.t);
  b.onkeydown = e => {
    let j = null;
    if(e.key === "ArrowRight") j = (i+1) % TABS.length;
    if(e.key === "ArrowLeft") j = (i-1+TABS.length) % TABS.length;
    if(e.key === "Home") j = 0;
    if(e.key === "End") j = TABS.length-1;
    if(j != null){ e.preventDefault(); const nb = $$("#tabs button")[j]; nb.focus(); show(nb.dataset.t); }
  };
});
window.addEventListener("hashchange", () => show(location.hash.replace("#/","")));

/* ---------- status ---------- */
async function pollHealth(){
  const el = $("#status");
  try{
    const j = await fetch("/health").then(r=>r.json());
    el.textContent = j.status === "ready" ? `● ready · ${j.policies.length} policies` : "● " + j.status;
    el.className = "status " + (j.status === "ready" ? "ok" : "down");
  }catch{ el.textContent = "● offline"; el.className = "status down"; }
}

/* ---------- policies ---------- */
async function loadPolicies(){
  const [names, full] = await Promise.all([
    fetch("/policies").then(r=>r.json()),
    fetch("/policies?full=1").then(r=>r.json()).catch(()=>({})),
  ]);
  POLICIES = names; FULL = full;
  for(const id of ["#pills","#bpills"]){
    const box = $(id); box.innerHTML = "";
    Object.keys(names).forEach((k,i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "pill"; b.textContent = k;
      b.setAttribute("aria-pressed", i===0 ? "true" : "false");
      b.onclick = () => { box.querySelectorAll(".pill").forEach(x=>x.setAttribute("aria-pressed","false")); b.setAttribute("aria-pressed","true"); if(id==="#pills") describe(k); };
      box.appendChild(b);
    });
  }
  describe(Object.keys(names)[0]);
  renderPolGrid();
}
const policyOf = sel => (document.querySelector(sel+" .pill[aria-pressed='true']")||{}).textContent || Object.keys(POLICIES)[0];
function describe(k){
  const p = POLICIES[k]; if(!p) return;
  $("#poldesc").textContent = `${p.description} · act ≥ ${p.auto_act_above}` +
    (p.escalate_below != null ? ` · escalate < ${p.escalate_below}` : "");
}

/* ---------- feedback primitives ---------- */
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),4000); }
function fieldErr(id, msg){
  const el = $(id);
  if(!msg){ el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false; el.innerHTML = `${svg("err",14)}<span>${esc(msg)}</span>`;
}
function setBusy(btn, label, busy, text){
  btn.disabled = busy; btn.setAttribute("aria-busy", busy ? "true" : "false");
  $(label).innerHTML = busy ? `<span class="spinner" aria-hidden="true"></span>&nbsp;${text}…` : text;
}

/* ---------- playground ---------- */
const bar = pct => `<div class="bar" role="img" aria-label="${pct.toFixed(1)} percent"><div class="fill" data-w="${(pct/100).toFixed(3)}"></div></div>`;
function answerCard(name, a){
  let rows = "";
  if(a.probabilities) for(const [l,p] of Object.entries(a.probabilities).sort((x,y)=>y[1]-x[1]))
    rows += `<div class="prow"><code>${esc(l)}</code><span class="pct">${(p*100).toFixed(1)}%</span></div>${bar(p*100)}`;
  else if(a.noul != null) rows = `<div class="prow"><code>P(true)</code><span class="pct">${(a.noul*100).toFixed(1)}%</span></div>${bar(a.noul*100)}`;
  const head = a.choice ? `→ <strong>${esc(a.choice)}</strong>` : a.score != null ? `score <strong>${a.score.toFixed(2)}</strong>` : a.noul != null ? `<strong>${(a.noul*100).toFixed(1)}%</strong>` : "";
  return `<div class="card"><div class="prow" style="margin-top:0"><span><code>${esc(name)}</code> <span class="mut">${a.type||""} · conf ${a.confidence ?? "—"}</span></span><span>${head}</span></div>${rows}</div>`;
}
const VICON = {act:"check", allow:"check", review:"alert", escalate:"stop", block:"stop"};
async function send(){
  fieldErr("#state-err", null); fieldErr("#opts-err", null);
  let state; try{ state = JSON.parse($("#state").value); }
  catch{ const t = $("#state").value.trim(); if(!t){ fieldErr("#state-err", "State must not be empty — paste text or JSON."); $("#state").focus(); return; } state = t; }
  if(typeof state === "object" && !Object.keys(state).length){ fieldErr("#state-err", "State must not be empty."); $("#state").focus(); return; }
  let opts = {}; try{ opts = JSON.parse($("#opts").value || "{}"); }
  catch{ fieldErr("#opts-err", "Options is not valid JSON — it must be an object like {}."); $("#opts").focus(); return; }
  const btn = $("#send"); setBusy(btn, "#send-label", true, "Deciding");
  $("#out").innerHTML = `<div class="skel" aria-hidden="true"><div class="ln" style="width:38%"></div><div class="ln"></div><div class="ln" style="width:72%"></div></div>`;
  const t0 = performance.now();
  try{
    const r = await fetch("/v1/decide/"+policyOf("#pills"), {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({state, ...opts})});
    const j = await r.json();
    if(!r.ok){ $("#out").innerHTML=""; toast(`Error ${r.status}: ${j.detail || "request failed"}`); return; }
    const ms = (performance.now()-t0).toFixed(0);
    $("#raw").textContent = JSON.stringify(j,null,2); $("#rawcard").hidden = false;
    const v = j.verdict || {};
    $("#meta").textContent = `${ms}ms · cache ${j.cache_hit?"hit":"miss"} · ${j.routing?.model||"?"} · ${j.routing?.reason||""}`;
    $("#out").innerHTML = `<div class="verdict vd-${v.verdict}"><div class="mark">${svg(VICON[v.verdict]||"alert",24)}</div>
      <div><div class="v">${v.verdict}</div>
      <div><small>confidence <strong>${v.confidence}</strong> · trigger <code class="mono">${esc(v.trigger||"—")}</code> · ${Object.keys(j.answers||{}).length} question(s), one forward pass</small></div></div></div>` +
      Object.entries(j.answers||{}).map(([k,a])=>answerCard(k,a)).join("");
    requestAnimationFrame(() => requestAnimationFrame(() =>
      $$("#out .fill").forEach(f => f.style.transform = `scaleX(${f.dataset.w})`)));
  }catch(e){ $("#out").innerHTML=""; toast("Request failed: "+e.message+" — is the gateway running?"); }
  finally{ setBusy(btn, "#send-label", false, "Decide"); }
}
$("#send").onclick = send;
document.addEventListener("keydown", e => { if((e.metaKey||e.ctrlKey) && e.key==="Enter" && !$("#v-play").hidden){ e.preventDefault(); send(); } });

/* ---------- batch ---------- */
$("#bsend").onclick = async () => {
  fieldErr("#bstates-err", null);
  const lines = $("#bstates").value.split("\n").map(s=>s.trim()).filter(Boolean);
  const states = [];
  for(const [i,l] of lines.entries()){ try{ states.push(JSON.parse(l)); }catch{ fieldErr("#bstates-err", `Line ${i+1} is not valid JSON — every line must be one object.`); return; } }
  if(!states.length){ fieldErr("#bstates-err", "Add at least one state (one JSON object per line)."); return; }
  const btn = $("#bsend"); setBusy(btn, "#bsend-label", true, "Scoring");
  const t0 = performance.now();
  try{
    const r = await fetch("/predict/batch", {method:"POST",headers:{"content-type":"application/json"},
      body: JSON.stringify({states, policy: policyOf("#bpills")})});
    const j = await r.json(); if(!r.ok){ toast(`Error ${r.status}: ${j.detail||"failed"}`); return; }
    $("#bmeta").textContent = `${j.count} states in ${(performance.now()-t0).toFixed(0)}ms`;
    $("#boutcard").hidden = false;
    $("#bout").innerHTML = j.results.map((res,i) => {
      const v = res.verdict?.verdict || verdictOf(res); const top = topOf(res);
      return `<tr><td>${i+1}</td><td class="mono">${esc(JSON.stringify(states[i]).slice(0,80))}</td>
        <td class="vd-${v}"><strong>${v}</strong>${res.cache_hit?' <span class="mut">cached</span>':""}</td><td>${esc(top)}</td></tr>`;
    }).join("");
  }catch(e){ toast("Batch failed: "+e.message); }
  finally{ setBusy(btn, "#bsend-label", false, "Score batch"); }
};
const verdictOf = res => { let b=0; for(const a of Object.values(res.answers||{})){ const s=a.noul ?? a.confidence ?? 0; if(s>b) b=s; } return b>=0.85?"act":b<0.6?"escalate":"review"; };
const topOf = res => { for(const [k,a] of Object.entries(res.answers||{})){ if(a.choice) return `${k} → ${a.choice}`; if(a.noul!=null) return `${k} ${(a.noul*100).toFixed(0)}%`; } return "—"; };

/* ---------- policies grid ---------- */
function renderPolGrid(){
  $("#polgrid").innerHTML = Object.entries(POLICIES).map(([k,p]) => {
    const qs = (FULL[k] && FULL[k].questions) || {};
    const chips = Object.entries(qs).map(([qn,q])=>`<span class="badge t-${q.type}">${esc(qn)} · ${q.type}</span>`).join(" ");
    return `<div class="card" tabindex="0" role="button" data-pol="${esc(k)}" aria-label="Use policy ${esc(k)} in playground"><h3>${esc(k)}</h3><div class="mut">${esc(p.description||"")}</div>
      <div style="margin:10px 0;display:flex;gap:6px;flex-wrap:wrap">${chips}</div>
      <div class="mut mono">act ≥ ${p.auto_act_above}${p.escalate_below!=null?` · esc &lt; ${p.escalate_below}`:""}</div></div>`;
  }).join("");
  const open = c => { const k = c.dataset.pol;
    $$("#pills .pill").forEach(x => x.setAttribute("aria-pressed", x.textContent===k ? "true" : "false"));
    describe(k); show("play"); window.scrollTo({top:0, behavior:"smooth"}); };
  $$("#polgrid .card").forEach(c => {
    c.onclick = () => open(c);
    c.onkeydown = e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(c); } };
  });
}

/* ---------- docs ---------- */
const nav = $("#docnav");
DOCS.forEach(([label,file],i) => {
  const b = document.createElement("button"); b.type="button"; b.textContent = label;
  b.setAttribute("aria-current", i===0 ? "true" : "false");
  b.onclick = () => { nav.querySelectorAll("button").forEach(x=>x.setAttribute("aria-current","false")); b.setAttribute("aria-current","true"); loadDoc(file); };
  nav.appendChild(b);
});
async function loadDoc(file){
  const body = $("#docbody"); body.innerHTML = "<p class=mut>loading…</p>";
  try{
    const t = await fetch("/docs-files/"+file).then(r=>{ if(!r.ok) throw new Error(r.status); return r.text(); });
    body.innerHTML = md(t); body.dataset.loaded = "1";
  }catch{ body.innerHTML = "<p>Could not load docs here. The full API reference is also at <a href='/docs'>/docs</a>.</p>"; }
}
function md(src){
  const lines = src.split("\n"); let html = "", i = 0, inCode = false, buf = [], inList = false, inTable = [];
  const flushP = () => { if(buf.length){ html += `<p>${inline(buf.join(" "))}</p>`; buf = []; } };
  const flushList = () => { if(inList){ html += "</ul>"; inList = false; } };
  const flushTable = () => { if(inTable.length){
    const rows = inTable.map(r => r.trim().replace(/^\||\|$/g,"").split("|").map(c=>c.trim()));
    html += "<table><thead><tr>"+rows[0].map(c=>`<th scope="col">${inline(c)}</th>`).join("")+"</tr></thead><tbody>" +
      rows.slice(2).map(r=>"<tr>"+r.map(c=>`<td>${inline(c)}</td>`).join("")+"</tr>").join("")+"</tbody></table>"; inTable = []; } };
  while(i < lines.length){
    const ln = lines[i];
    if(/^```/.test(ln)){ if(!inCode){ inCode = true; html += "<pre><code>"; } else { inCode = false; html += "</code></pre>"; } i++; continue; }
    if(inCode){ html += esc(ln)+"\n"; i++; continue; }
    if(/^\|.*\|$/.test(ln)){ flushP(); flushList(); inTable.push(ln); i++; continue; }
    if(inTable.length){ flushTable(); continue; }
    if(/^#{1,4} /.test(ln)){ flushP(); flushList(); const d = ln.match(/^(#+) (.*)/); html += `<h${d[1].length}>${inline(d[2])}</h${d[1].length}>`; i++; continue; }
    if(/^---+$/.test(ln)){ flushP(); flushList(); html += "<hr>"; i++; continue; }
    if(/^([-*]|\d+\.) /.test(ln)){ flushP(); if(!inList){ html += "<ul>"; inList = true; } html += `<li>${inline(ln.replace(/^([-*]|\d+\.) /,""))}</li>`; i++; continue; }
    if(!ln.trim()){ flushP(); flushList(); i++; continue; }
    buf.push(ln.trim()); i++;
  }
  flushP(); flushList(); flushTable(); return html;
}
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

/* ---------- metrics ---------- */
async function refreshMetrics(){
  try{
    const [m, h] = await Promise.all([fetch("/metrics").then(r=>r.json()), fetch("/health").then(r=>r.json())]);
    $("#kpis").innerHTML = [
      ["requests", m.requests], ["cache hit rate", (m.cache_hit_rate*100).toFixed(1)+"%"],
      ["avg latency", m.avg_latency_ms+"ms"], ["blocks", m.blocks], ["errors", m.errors],
      ["cache entries", h.cache_entries ?? "—"],
    ].map(([k,v])=>`<div class="kpi"><div class="k">${k}</div><div class="n">${v}</div></div>`).join("");
    $("#mhealth").textContent = JSON.stringify(h, null, 2);
  }catch{ $("#kpis").innerHTML = "<p class=mut>metrics unavailable — is the gateway running?</p>"; }
}
$("#mrefresh").onclick = refreshMetrics;

/* ---------- boot ---------- */
(async function(){
  await pollHealth(); setInterval(pollHealth, 10000);
  await loadPolicies();
  initLandingChrome();
  show(location.hash.replace("#/","") || "home");
})();

/* ---------- landing: nav shortcuts, accordion, marquee, GSAP ---------- */
function initLandingChrome(){
  $$("[data-goto]").forEach(b => b.onclick = () => {
    const t = b.dataset.goto;
    if(t === "docs"){ show("docs"); return; }
    show(t, true);
  });
  $$(".media-card[data-goto]").forEach(c => {
    c.addEventListener("keydown", e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); show(c.dataset.goto, true); } });
  });
  // seamless marquee: duplicate track content once
  const track = $("#marquee-track");
  if(track && !track.dataset.dup){ track.innerHTML += track.innerHTML; track.dataset.dup = "1"; }
  // accordion: single-open, first expanded; re-click an open slice to try it
  const slices = $$("#hacc .hslice");
  const openSlice = s => slices.forEach(x => x.setAttribute("aria-expanded", x === s ? "true" : "false"));
  if(slices.length) openSlice(slices[0]);
  slices.forEach(s => s.onclick = () => {
    if(s.getAttribute("aria-expanded") === "true"){
      const k = s.dataset.pol;
      $$("#pills .pill").forEach(x => x.setAttribute("aria-pressed", x.textContent===k ? "true" : "false"));
      describe(k); show("play", true);
    } else openSlice(s);
  });
}

let _motionDone = false;
function initLandingMotion(){
  if(_motionDone) return; _motionDone = true;
  try{
    if(!window.gsap || !window.ScrollTrigger) return;
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    // hero entrance: fade + rise, expo.out
    gsap.from(".hero-in > *", {y:34, opacity:0, duration:.9, ease:"expo.out", stagger:.12});
    // image scale + fade on scroll
    gsap.utils.toArray(".zoom-img img").forEach(img => {
      gsap.fromTo(img, {scale:.82, opacity:.35}, {scale:1, opacity:1, ease:"none",
        scrollTrigger:{trigger:img, start:"top bottom", end:"top 35%", scrub:true}});
    });
    // scrubbing word reveal
    const sc = $("#scrub");
    if(sc && !sc.dataset.split){
      sc.dataset.split = "1";
      sc.innerHTML = sc.textContent.trim().split(/\s+/).map(w=>`<span class="w">${esc(w)}</span>`).join(" ");
      gsap.fromTo("#scrub .w", {opacity:.1}, {opacity:1, ease:"none", stagger:.06,
        scrollTrigger:{trigger:sc, start:"top 80%", end:"bottom 45%", scrub:true}});
    }
    // pinned stat rail (desktop only; CSS sticky covers the rest)
    ScrollTrigger.matchMedia({
      "(min-width: 821px)": function(){
        gsap.to(".pin-left", {y:-30, ease:"none",
          scrollTrigger:{trigger:".pin-wrap", start:"top top+=80", end:"bottom bottom", scrub:true, pin:".pin-left"}});
      }
    });
  }catch(e){ /* motion is decoration; the page works without it */ }
}
