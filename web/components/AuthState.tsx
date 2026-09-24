"use client";
import { signOut, useSessionContext } from "supertokens-auth-react/recipe/session";
import { AUTH_OFF } from "@/lib/supertokens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function Authed() {
  const ctx = useSessionContext();
  if (ctx.loading) return <Badge variant="secondary" role="status">…</Badge>;
  if (!ctx.doesSessionExist)
    return (
      <Button size="sm" asChild>
        <a href="/auth">Sign in</a>
      </Button>
    );
  return (
    <>
      <Button variant="outline" size="sm" asChild>
        <a href="/dashboard">Account</a>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={async () => {
          await signOut();
          window.location.href = "/";
        }}
      >
        Sign out
      </Button>
    </>
  );
}

export function AuthSlot() {
  if (AUTH_OFF)
    return (
      <Button variant="outline" size="sm" asChild title="Auth disabled — local dev mode">
        <a href="/dashboard">Dev mode</a>
      </Button>
    );
  return <Authed />;
}
