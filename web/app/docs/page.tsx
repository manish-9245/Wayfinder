"use client";
import { useEffect, useState } from "react";
import { api, toast } from "@/lib/api";
import { md } from "@/lib/md";

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
  const [html, setHtml] = useState("<p class=mut>loading…</p>");

  useEffect(() => {
    api.doc(cur[1])
      .then((t) => setHtml(md(t)))
      .catch(() => setHtml("<p>Could not load docs here. The full API reference is also at <a href='/docs'>/docs</a>.</p>"));
  }, [cur]);

  return (
    <div className="docs">
      <nav aria-label="Documentation sections">
        {DOCS.map(([label, file]) => (
          <button key={file} type="button" aria-current={cur[1] === file}
            onClick={() => setCur([label, file] as (typeof DOCS)[number])}>
            {label}
          </button>
        ))}
      </nav>
      <div className="card doc-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
