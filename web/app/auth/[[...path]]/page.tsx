"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { canHandleRoute, getRoutingComponent } from "supertokens-auth-react/ui";
import { AUTH_OFF, preBuiltUI } from "@/lib/supertokens";
import { safeNext } from "@/lib/login-redirect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function LoginNotice() {
  const params = useSearchParams();
  const message = params.get("message");
  const next = safeNext(params.get("next"));
  if (!message && !next) return null;
  return (
    <Alert className="mx-auto mb-4 max-w-2xl">
      <LogIn aria-hidden="true" className="size-4" />
      <AlertTitle>Sign-in required</AlertTitle>
      <AlertDescription>
        {message || "Log in to continue."}
        {next && (
          <span className="mt-2 block">
            <Button variant="link" asChild className="h-auto p-0">
              <Link href={next}>Continue to {next}</Link>
            </Button>
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthInner />
    </Suspense>
  );
}

function AuthInner() {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  if (AUTH_OFF)
    return (
      <>
        <LoginNotice />
        <Card className="mx-auto mt-10 max-w-2xl">
          <CardHeader>
            <p className="eyebrow">Wayfinder — sign-in</p>
            <CardTitle className="mt-2 font-tsj-display">Sign-in is disabled on this deployment.</CardTitle>
            <CardDescription>
              Use a <code className="rounded border bg-background px-1.5 py-px font-mono text-xs">wf_…</code> API key
              from the dashboard for scripts and the console. Managed sign-in and
              self-hosting are documented on{" "}
              <a href="https://github.com/manish-9245/Wayfinder" className="text-info hover:underline">
                GitHub
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard">Continue to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  if (!ready) return null;
  const ui = preBuiltUI();
  if (!canHandleRoute(ui))
    return (
      <>
        <LoginNotice />
        <Card className="mx-auto mt-10 max-w-2xl">
          <CardHeader>
            <p className="eyebrow">Wayfinder — sign-in</p>
            <CardTitle className="mt-2 font-tsj-display">Nothing here.</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/auth">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  return (
    <>
      <LoginNotice />
      <div className="grid place-items-center px-4 py-12">{getRoutingComponent(ui)}</div>
    </>
  );
}
