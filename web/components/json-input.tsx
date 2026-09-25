"use client";
import { useEffect, useRef } from "react";
import { highlightCode } from "@/lib/highlight";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* JSON input with live syntax highlighting: a highlighted <pre> sits under
   a transparent textarea with identical metrics; scroll is mirrored. The
   glass frame lives on the wrapper (backdrop-blur on the textarea itself
   would blur the highlight layer beneath it). Regex-based highlighting
   never throws on partial/invalid JSON. */
export function JsonInput({
  id,
  value,
  onChange,
  rows,
  placeholder,
  ariaDescribedBy,
  className,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  placeholder?: string;
  ariaDescribedBy?: string;
  className?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    const pre = preRef.current;
    if (!ta || !pre) return;
    const sync = () => {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    };
    sync();
    ta.addEventListener("scroll", sync, { passive: true });
    return () => ta.removeEventListener("scroll", sync);
  }, []);

  return (
    <div
      className={cn(
        "relative rounded-md border border-white/15 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-md transition-colors focus-within:ring-2 focus-within:ring-ring",
        className
      )}
    >
      <pre
        ref={preRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words bg-transparent px-3 py-2 font-mono text-xs leading-6"
        dangerouslySetInnerHTML={{ __html: highlightCode("json", value) + "\n" }}
      />
      <Textarea
        ref={taRef}
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-describedby={ariaDescribedBy}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="relative border-transparent bg-transparent text-transparent shadow-none backdrop-blur-none selection:bg-[hsl(var(--info)/0.4)] selection:text-[hsl(var(--foreground))] caret-[hsl(var(--foreground))] focus-visible:ring-0"
      />
    </div>
  );
}
