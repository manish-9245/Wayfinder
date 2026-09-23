"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const TABS = [
  ["/", "Home"],
  ["/console", "Console"],
  ["/batch", "Batch"],
  ["/policies", "Policies"],
  ["/docs", "Docs"],
  ["/metrics", "Metrics"],
] as const;

function ThemeControl() {
  const [mode, setMode] = useState<"system" | "dark" | "light">("system");
  useEffect(() => {
    try {
      const s = localStorage.getItem("wayfinder.theme");
      if (s === "dark" || s === "light" || s === "system") setMode(s);
    } catch {}
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const t = mode === "system" ? (mq.matches ? "light" : "dark") : mode;
      document.documentElement.dataset.theme = t;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#0F172A" : "#F1F5F9");
    };
    apply();
    mq.addEventListener("change", apply);
    try { localStorage.setItem("wayfinder.theme", mode); } catch {}
    return () => mq.removeEventListener("change", apply);
  }, [mode]);
  return (
    <div className="seg" role="group" aria-label="Color theme">
      {(["system", "dark", "light"] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
          {m}
        </button>
      ))}
    </div>
  );
}

export default function Nav() {
  const path = usePathname();
  const [status, setStatus] = useState("connecting…");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const j = await (await fetch("/api/health")).json();
        if (!live) return;
        setStatus(j.status === "ready" ? `● ready · ${j.policies.length} policies` : "● " + j.status);
        setOk(j.status === "ready");
      } catch {
        if (!live) return;
        setStatus("● offline"); setOk(false);
      }
    };
    poll();
    const h = setInterval(poll, 10000);
    return () => { live = false; clearInterval(h); };
  }, []);

  return (
    <header className="pillnav">
      <div className="pillnav-in">
        <Link className="brand" href="/" aria-label="Wayfinder home">
          <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
            <defs>
              <linearGradient id="wfmark" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#22C55E" /><stop offset="1" stopColor="#38BDF8" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="9" fill="url(#wfmark)" />
            <path d="M16 6l2.4 7.6L26 16l-7.6 2.4L16 26l-2.4-7.6L6 16l7.6-2.4z" fill="#fff" />
            <circle cx="16" cy="16" r="1.6" fill="#0F172A" />
          </svg>
          <span>Wayfinder</span>
        </Link>
        <nav className="tabs" aria-label="Primary">
          {TABS.map(([href, label]) => (
            <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
              className={path === href ? "on" : ""}>
              {label}
            </Link>
          ))}
        </nav>
        <span className={`status ${ok ? "ok" : ""}`} role="status">{status}</span>
        <ThemeControl />
      </div>
    </header>
  );
}
