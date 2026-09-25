"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { api, toast } from "@/lib/api";
import { PolicyMark } from "@/components/illustrations";
import { Badge } from "@/components/ui/badge";

export default function PoliciesPage() {
  useEffect(() => { document.title = "Policies — wayfinder"; }, []);
  const [names, setNames] = useState<Record<string, any>>({});
  const [full, setFull] = useState<Record<string, any>>({});

  useEffect(() => {
    Promise.all([api.policies(), api.policiesFull()])
      .then(([n, f]) => { setNames(n); setFull(f); })
      .catch((e) => toast(e.message));
  }, []);

  const entries = Object.entries(names);
  return (
    <>
      <div className="mb-8 mt-6">
        <p className="eyebrow">Wayfinder — policy index</p>
        <h1 className="mt-2 font-tsj-display text-4xl font-bold tracking-tight md:text-5xl">Policies</h1>
        <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
          Questions plus thresholds. Select one to load it in the console — {entries.length > 0 ? `${entries.length} policies ship with the gateway.` : "loading the catalogue…"}
        </p>
      </div>
      <div className="hairline-t">
        {entries.map(([k, p], i) => {
          const qs = (full[k]?.questions || {}) as Record<string, any>;
          return (
            <Link
              key={k}
              href={`/console?policy=${k}`}
              aria-label={`Use policy ${k} in console`}
              className="hairline-b group grid grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-2 px-1 py-6 no-underline transition-colors hover:bg-accent/40 md:grid-cols-[64px_280px_1fr_auto] md:gap-x-6"
            >
              <span className="section-num pt-1">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="grid size-10 place-items-center text-muted-foreground [&_svg]:size-full">
                  <PolicyMark policy={k} size={40} />
                </span>
                <span className="mt-2 block font-tsj-mono text-sm font-semibold group-hover:text-ember">{k}</span>
                <span className="mt-1 block font-tsj-mono text-[11px] text-muted-foreground">
                  act ≥ {p.auto_act_above}
                  {p.escalate_below != null ? ` · escalate < ${p.escalate_below}` : ""}
                </span>
              </span>
              <span className="col-span-3 md:col-span-1">
                <span className="block max-w-[62ch] text-sm text-muted-foreground">{p.description}</span>
                <span className="mt-2.5 flex flex-wrap gap-1.5">
                  {Object.entries(qs).map(([qn, q]) => (
                    <Badge
                      key={qn}
                      variant={q.type === "noul" ? "success" : "info"}
                    >
                      {qn} · {q.type}
                    </Badge>
                  ))}
                </span>
              </span>
              <ArrowUpRight aria-hidden="true" className="mt-1 size-5 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ember" />
            </Link>
          );
        })}
      </div>
    </>
  );
}
