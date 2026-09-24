"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { AUTH_OFF } from "@/lib/supertokens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuthSlot } from "./AuthState";

const TABS = [
  ["/", "Home"],
  ["/console", "Console"],
  ["/batch", "Batch"],
  ["/policies", "Policies"],
  ["/docs", "Docs"],
  ["/metrics", "Metrics"],
  ["/dashboard", "Dashboard"],
] as const;

const ADMIN_TAB = ["/admin", "Admin"] as const;

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const modes = [
    { m: "system", Icon: Laptop },
    { m: "dark", Icon: Moon },
    { m: "light", Icon: Sun },
  ] as const;
  return (
    <div className="ml-auto flex items-center gap-0.5 rounded-md border bg-background p-0.5" role="group" aria-label="Color theme">
      {modes.map(({ m, Icon }) => (
        <Button
          key={m}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={mounted && theme === m}
          aria-label={`${m} theme`}
          onClick={() => setTheme(m)}
          className={cn(
            "h-9 px-2.5 capitalize",
            mounted && theme === m && "bg-secondary text-foreground shadow-sm"
          )}
        >
          <Icon aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}

export default function SiteHeader() {
  const path = usePathname();
  const [status, setStatus] = useState("connecting…");
  const [ok, setOk] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let live = true;
    // Quiet identity check (no login redirect): the Admin tab only appears
    // for admins. In keyless dev mode the local dev-admin owns everything.
    (async () => {
      if (AUTH_OFF) {
        if (live) setIsAdmin(true);
        return;
      }
      try {
        let key: string | null = null;
        try {
          key = localStorage.getItem("wayfinder.key");
        } catch {
          /* private mode */
        }
        const r = await fetch("/api/v1/me", {
          credentials: "include",
          headers: key ? { authorization: `Bearer ${key}` } : {},
        });
        if (!live) return;
        if (r.ok) setIsAdmin((await r.json()).role === "admin");
      } catch {
        /* offline or anonymous — Admin stays hidden */
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const j = await (await fetch("/api/health")).json();
        if (!live) return;
        setStatus(j.status === "ready" ? `ready · ${j.policies.length} policies` : String(j.status));
        setOk(j.status === "ready");
      } catch {
        if (!live) return;
        setStatus("offline");
        setOk(false);
      }
    };
    poll();
    const h = setInterval(poll, 10000);
    return () => {
      live = false;
      clearInterval(h);
    };
  }, []);

  return (
    <header className="sticky top-3 z-20 px-4">
      <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl border bg-card/80 px-3.5 py-2.5 shadow-lg backdrop-blur-xl">
        <Link href="/" aria-label="Wayfinder home" className="inline-flex items-center gap-2 text-base font-bold tracking-tight text-foreground no-underline">
          <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
            <defs>
              <linearGradient id="wfmark" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#22C55E" />
                <stop offset="1" stopColor="#38BDF8" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="9" fill="url(#wfmark)" />
            <path d="M16 6l2.4 7.6L26 16l-7.6 2.4L16 26l-2.4-7.6L6 16l7.6-2.4z" fill="#fff" />
            <circle cx="16" cy="16" r="1.6" fill="#0F172A" />
          </svg>
          <span>Wayfinder</span>
        </Link>
        <nav className="order-3 flex basis-full gap-1 overflow-x-auto md:order-none md:basis-auto" aria-label="Primary">
          {[...TABS, ...(isAdmin ? [ADMIN_TAB] : [])].map(([href, label]) => (
            <Button
              key={href}
              variant="ghost"
              size="sm"
              asChild
              className={cn(path === href && "bg-secondary text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]")}
            >
              <Link href={href} aria-current={path === href ? "page" : undefined}>
                {label}
              </Link>
            </Button>
          ))}
        </nav>
        <Badge variant={ok === null ? "secondary" : ok ? "success" : "destructive"} role="status" className="hidden lg:inline-flex">
          {status}
        </Badge>
        <AuthSlot />
        <Button variant="ghost" size="icon" asChild title="Star Wayfinder on GitHub">
          <a href="https://github.com/manish-9245/Wayfinder" target="_blank" rel="noreferrer" aria-label="Star Wayfinder on GitHub">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.15c0 .3.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
          </a>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
