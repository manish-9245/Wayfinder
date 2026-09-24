import { redirect } from "next/navigation";

function forward(searchParams: Record<string, string | string[] | undefined>, extra: string) {
  const q = new URLSearchParams();
  for (const k of ["message", "next"]) {
    const v = searchParams[k];
    if (typeof v === "string" && v) q.set(k, v);
  }
  if (extra) q.set("show", extra);
  const s = q.toString();
  redirect(s ? `/auth?${s}` : "/auth");
}

export default function SignUpPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  forward(searchParams, "signup");
}
