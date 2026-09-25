"use client";
import { useEffect, useRef, useState } from "react";
import { Braces, Plug, Rocket, ShieldCheck } from "lucide-react";
import { api, toast } from "@/lib/api";
import { extractToc, md, type TocEntry } from "@/lib/md";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DOCS = [
  ["API", "API.md", Braces, "Endpoints, verdicts, thresholds"],
  ["Policies", "POLICIES.md", ShieldCheck, "The four decision bundles"],
  ["MCP", "MCP.md", Plug, "Claude Desktop & Cursor setup"],
  ["Deploy", "DEPLOY.md", Rocket, "Docker, Railway & production"],
] as const;

export default function DocsPage() {
  useEffect(() => { document.title = "Docs — wayfinder"; }, []);
  const [cur, setCur] = useState<(typeof DOCS)[number]>(DOCS[0]);
  const [html, setHtml] = useState("<p>loading…</p>");
  const [toc, setToc] = useState<TocEntry[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.doc(cur[1])
      .then((t) => { const rendered = md(t); setHtml(rendered); setToc(extractToc(rendered)); })
      .catch(() => {
        toast("Could not load docs here");
        setHtml("<p>Could not load docs here. The full API reference is also at <a href='/docs'>/docs</a>.</p>");
        setToc([]);
      });
  }, [cur]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const selectTab = (tabs: HTMLButtonElement, idx: number) => {
      const group = tabs.closest("[data-codetabs]");
      if (!group) return;
      const all = [...group.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      const panels = [...group.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
      all.forEach((b, i) => {
        const on = i === idx;
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
        panels[i]?.toggleAttribute("hidden", !on);
      });
      all[idx]?.focus();
    };
    const onClick = async (e: MouseEvent) => {
      const tab = (e.target as HTMLElement).closest?.('[role="tab"]') as HTMLButtonElement | null;
      if (tab && root.contains(tab)) {
        const group = tab.closest("[data-codetabs]");
        const all = group ? [...group.querySelectorAll<HTMLButtonElement>('[role="tab"]')] : [];
        selectTab(tab, all.indexOf(tab));
        return;
      }
      const btn = (e.target as HTMLElement).closest?.("[data-copy]");
      if (!btn || !root.contains(btn)) return;
      const code = btn.closest("figure")?.querySelector("code")?.innerText ?? "";
      try {
        await navigator.clipboard.writeText(code);
        const el = btn as HTMLButtonElement;
        const prev = el.textContent;
        el.textContent = "Copied";
        toast("Snippet copied");
        window.setTimeout(() => { el.textContent = prev; }, 1200);
      } catch {
        toast("Copy failed — select the snippet manually");
      }
    };
    root.addEventListener("click", onClick);
    const onKey = (e: KeyboardEvent) => {
      const tab = (e.target as HTMLElement).closest?.('[role="tab"]') as HTMLButtonElement | null;
      if (!tab || !root.contains(tab)) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const group = tab.closest("[data-codetabs]");
      const all = group ? [...group.querySelectorAll<HTMLButtonElement>('[role="tab"]')] : [];
      const next = (all.indexOf(tab) + (e.key === "ArrowRight" ? 1 : -1) + all.length) % all.length;
      selectTab(tab, next);
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKey);
    };
  }, [html]);

  return (
    <div className="mt-6">
      <p className="eyebrow">Wayfinder — docs</p>
      <h1 className="mb-6 mt-2 font-tsj-display text-3xl font-bold tracking-tight md:text-4xl">Documentation</h1>
      <div className="grid items-start gap-8 md:grid-cols-[250px_1fr]">
        <nav aria-label="Documentation sections" className="hairline-t md:sticky md:top-24">
          {DOCS.map((entry, i) => {
            const [label, file, Icon, blurb] = entry;
            const active = cur[1] === file;
            return (
              <button
                key={file}
                type="button"
                aria-current={active}
                onClick={() => setCur(entry)}
                className={cn(
                  "hairline-b grid w-full grid-cols-[auto_1fr] items-start gap-3 px-1 py-3.5 text-left transition-colors hover:bg-accent/40",
                  active && "bg-accent/40"
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span className={cn("section-num", !active && "text-muted-foreground")}>{String(i + 1).padStart(2, "0")}</span>
                  <Icon aria-hidden="true" className={cn("size-[18px]", active ? "text-ember" : "text-muted-foreground")} />
                </span>
                <span>
                  <span className={cn("font-tsj-grot text-[15px] font-semibold", active && "text-ember")}>{label}</span>
                  <span className="mt-0.5 block font-tsj-mono text-[11px] text-muted-foreground">{blurb}</span>
                </span>
              </button>
            );
          })}
          {toc.length > 0 && (
            <div className="mt-5 hidden md:block">
              <p className="eyebrow mb-2">On this page</p>
              <ul className="grid gap-1">
                {toc.map((t) => (
                  <li key={t.id} className={cn(t.level === 3 && "ml-4")}>
                    <a href={`#${t.id}`} className="font-tsj-mono text-xs text-muted-foreground hover:text-ember hover:underline">
                      {t.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
        <Card className="min-w-0 border-white/15 bg-card/55 shadow-[0_8px_32px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-2xl backdrop-saturate-150">
          <CardContent className="doc-body pt-6" ref={bodyRef} dangerouslySetInnerHTML={{ __html: html }} />
        </Card>
      </div>
    </div>
  );
}
