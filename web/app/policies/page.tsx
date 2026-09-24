"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, toast } from "@/lib/api";
import { PolicyMark } from "@/components/illustrations";
import { Spotlight } from "@/components/aceternity/spotlight";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PoliciesPage() {
  useEffect(() => { document.title = "Policies — wayfinder"; }, []);
  const [names, setNames] = useState<Record<string, any>>({});
  const [full, setFull] = useState<Record<string, any>>({});

  useEffect(() => {
    Promise.all([api.policies(), api.policiesFull()])
      .then(([n, f]) => { setNames(n); setFull(f); })
      .catch((e) => toast(e.message));
  }, []);

  return (
    <>
      <div className="mb-4 mt-6">
        <h1 className="text-4xl font-bold tracking-tight">Policies.</h1>
        <p className="mt-1 text-sm text-muted-foreground">Questions plus thresholds. Select one to load it in the console.</p>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(names).map(([k, p]) => {
          const qs = (full[k]?.questions || {}) as Record<string, any>;
          return (
            <Link key={k} href={`/console?policy=${k}`} aria-label={`Use policy ${k} in console`} className="no-underline">
              <Spotlight className="h-full rounded-lg">
              <Card className="h-full transition-colors hover:border-info">
                <CardHeader className="flex-row items-center gap-3.5 space-y-0">
                  <span className="grid size-11 shrink-0 place-items-center text-muted-foreground [&_svg]:size-full">
                    <PolicyMark policy={k} size={44} />
                  </span>
                  <CardTitle className="break-all">{k}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{p.description}</CardDescription>
                  <div className="my-2.5 flex flex-wrap gap-1.5">
                    {Object.entries(qs).map(([qn, q]) => (
                      <Badge
                        key={qn}
                        variant={q.type === "noul" ? "success" : "info"}
                      >
                        {qn} · {q.type}
                      </Badge>
                    ))}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    act ≥ {p.auto_act_above}
                    {p.escalate_below != null ? ` · esc < ${p.escalate_below}` : ""}
                  </p>
                </CardContent>
              </Card>
              </Spotlight>
            </Link>
          );
        })}
      </div>
    </>
  );
}
