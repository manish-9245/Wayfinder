"use client";
import { useEffect, useState } from "react";
import { api, toast } from "@/lib/api";
import { md } from "@/lib/md";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DOCS = [
  ["API", "API.md"],
  ["Policies", "POLICIES.md"],
  ["MCP", "MCP.md"],
  ["Architecture", "ARCHITECTURE.md"],
  ["Deploy", "DEPLOY.md"],
] as const;

export default function DocsPage() {
  useEffect(() => { document.title = "Docs — wayfinder"; }, []);
  const [cur, setCur] = useState<(typeof DOCS)[number]>(DOCS[0]);
  const [html, setHtml] = useState("<p>loading…</p>");

  useEffect(() => {
    api.doc(cur[1])
      .then((t) => setHtml(md(t)))
      .catch(() => {
        toast("Could not load docs here");
        setHtml("<p>Could not load docs here. The full API reference is also at <a href='/docs'>/docs</a>.</p>");
      });
  }, [cur]);

  return (
    <div className="grid items-start gap-4 md:grid-cols-[230px_1fr]">
      <nav aria-label="Documentation sections" className="flex flex-row flex-wrap gap-1 md:sticky md:top-24 md:flex-col">
        {DOCS.map(([label, file]) => (
          <Button
            key={file}
            type="button"
            variant="ghost"
            aria-current={cur[1] === file}
            onClick={() => setCur([label, file] as (typeof DOCS)[number])}
            className={cn(
              "justify-start",
              cur[1] === file && "bg-secondary text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]"
            )}
          >
            {label}
          </Button>
        ))}
      </nav>
      <Card className="min-w-0">
        <CardContent className="doc-body pt-6" dangerouslySetInnerHTML={{ __html: html }} />
      </Card>
    </div>
  );
}
