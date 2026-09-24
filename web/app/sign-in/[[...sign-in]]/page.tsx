import { redirect } from "next/navigation";

function forward(searchParams: Record<string, string | string[] | undefined>) {
  const q = new URLSearchParams();
  for (const k of ["message", "next"]) {
    const v = searchParams[k];
    if (typeof v === "string" && v) q.set(k, v);
  }
  const s = q.toString();
  redirect(s ? `/auth?${s}` : "/auth");
}

export default function SignInPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  forward(searchParams);
}
