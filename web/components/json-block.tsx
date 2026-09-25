"use client";
import { useState } from "react";
import { highlightCode } from "@/lib/highlight";
import { toast } from "@/lib/api";
import { cn } from "@/lib/utils";

/* Glassmorphic JSON output block: pretty-printed + syntax-highlighted,
   with a copy button. Use for API responses and runtime config. */
export function JsonBlock({
  label,
  data,
  className,
}: {
  label: string;
  data: unknown;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [pretty, setPretty] = useState(true);
  const text = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast("JSON copied");
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast("Copy failed — select the output manually");
    }
  };
  return (
    <figure className={cn("jsonblock", className)}>
      <figcaption>
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => setPretty((p) => !p)}>
            {pretty ? "Compact" : "Pretty"}
          </button>
          <button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        </span>
      </figcaption>
      <pre tabIndex={0} dangerouslySetInnerHTML={{ __html: highlightCode("json", text) }} />
    </figure>
  );
}
