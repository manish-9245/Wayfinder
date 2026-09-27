"use client";
import { useState } from "react";
import Link from "next/link";
import { KeyRound, LogIn } from "lucide-react";
import { loginUrl } from "@/lib/login-redirect";
import { saveKeyForConsole } from "@/lib/platform";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Inline sign-in prompt for pages that work without an account until the
 *  gateway answers 401. No navigation hijack: the user's state stays on
 *  screen, and signing in (or pasting a wf_ key) retries in place. */
export function AuthNeeded({ onAuthed }: { onAuthed: () => void }) {
  const [key, setKey] = useState("");
  const here =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/console";
  return (
    <Card className="my-4" role="status">
      <CardHeader>
        <p className="eyebrow">Wayfinder — sign-in</p>
        <CardTitle className="mt-2 flex items-center gap-2 font-tsj-display">
          <LogIn aria-hidden="true" className="size-5" />
          Sign in to score
        </CardTitle>
        <CardDescription>
          This gateway requires authentication. Sign in once — your session
          refreshes itself, you won&apos;t be asked again — or paste a{" "}
          <code className="rounded border bg-background px-1.5 py-px font-mono text-xs">wf_…</code>{" "}
          API key from the dashboard to keep working without an account.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <Button asChild>
            <Link href={loginUrl("Log in to continue.", here)}>Sign in</Link>
          </Button>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="authneeded-key" className="font-tsj-mono text-[11px] uppercase tracking-[0.14em]">
            Or continue with an API key
          </Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="authneeded-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="wf_…"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 font-mono"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!key.trim()}
              onClick={() => {
                saveKeyForConsole(key.trim() || null);
                setKey("");
                onAuthed();
              }}
            >
              <KeyRound aria-hidden="true" className="size-4" />
              Use key & retry
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
