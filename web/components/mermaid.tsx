"use client";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Client-rendered mermaid diagram (dynamically imported, off the main bundle).
 *  Renders in the current theme; falls back to the raw chart text if the
 *  diagram fails to parse so a typo never blanks the page. */
export function Mermaid({ chart, className }: { chart: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = document.documentElement.classList.contains("dark");
        mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: dark ? "dark" : "neutral",
          themeVariables: dark
            ? {
                primaryColor: "#14532d",
                primaryTextColor: "#f0faf4",
                primaryBorderColor: "#22c55e",
                lineColor: "#5eead4",
                secondaryColor: "#0f1f16",
                tertiaryColor: "#0b1410",
                background: "#0d1812",
                mainBkg: "#14532d",
                nodeBorder: "#22c55e",
              }
            : {
                primaryColor: "#dcfce7",
                primaryTextColor: "#14532d",
                primaryBorderColor: "#16a34a",
                lineColor: "#0d9488",
              },
        });
        const { svg } = await mermaid.render(`mmd-${rawId}`, chart);
        if (live && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [chart, rawId]);

  if (failed) {
    return (
      <figure className={cn("codeblock", className)}>
        <figcaption>
          <span>diagram source</span>
        </figcaption>
        <pre data-lang="mermaid">
          <code>{chart}</code>
        </pre>
      </figure>
    );
  }
  return (
    <div
      ref={ref}
      role="img"
      aria-label="Architecture diagram"
      className={cn(
        "my-6 grid place-items-center overflow-x-auto rounded-xl border border-white/15 bg-card/55 px-4 py-6",
        className
      )}
    >
      <span className="font-tsj-mono text-xs text-muted-foreground">rendering diagram…</span>
    </div>
  );
}
