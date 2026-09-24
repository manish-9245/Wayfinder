"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { canHandleRoute, getRoutingComponent } from "supertokens-auth-react/ui";
import { AUTH_OFF, preBuiltUI } from "@/lib/supertokens";

export default function AuthPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  if (AUTH_OFF)
    return (
      <div className="chapter narrow">
        <h1 className="display">Auth is disabled in dev.</h1>
        <p className="mut">Unset <code>NEXT_PUBLIC_AUTH_DISABLED</code> and point the gateway at a SuperTokens core for managed sign-in.</p>
        <p><Link className="primary btn-link" href="/dashboard">Continue to dashboard</Link></p>
      </div>
    );
  if (!ready) return null;
  const ui = preBuiltUI();
  if (!canHandleRoute(ui))
    return (
      <div className="chapter narrow">
        <h1 className="display">Nothing here.</h1>
        <p><Link className="ghost btn-link" href="/auth">Back to sign in</Link></p>
      </div>
    );
  return <div className="auth-wrap">{getRoutingComponent(ui)}</div>;
}
