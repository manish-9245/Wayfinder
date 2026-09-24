"use client";
import { signOut, useSessionContext } from "supertokens-auth-react/recipe/session";
import { AUTH_OFF } from "@/lib/supertokens";

function Authed() {
  const ctx = useSessionContext();
  if (ctx.loading) return <span className="status" role="status">…</span>;
  if (!ctx.doesSessionExist)
    return (
      <a className="primary btn-link sm" href="/auth">Sign in</a>
    );
  return (
    <>
      <a className="ghost btn-link sm" href="/dashboard">Account</a>
      <button
        type="button"
        className="ghost mini"
        onClick={async () => {
          await signOut();
          window.location.href = "/";
        }}
      >
        Sign out
      </button>
    </>
  );
}

/** Sign-in state when SuperTokens is configured, dev shortcut otherwise. */
export function AuthSlot() {
  if (AUTH_OFF)
    return (
      <a className="ghost btn-link sm" href="/dashboard" title="Auth disabled — local dev mode">
        Dev mode
      </a>
    );
  return <Authed />;
}
