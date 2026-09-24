"use client";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

export const CLERK_ON =
  typeof process !== "undefined" &&
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function Authed() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <span className="status" role="status">…</span>;
  if (!isSignedIn)
    return (
      <SignInButton mode="modal">
        <button type="button" className="primary btn-link sm">Sign in</button>
      </SignInButton>
    );
  return <UserButton afterSignOutUrl="/" />;
}

/** Sign-in button when Clerk is configured, dev shortcut otherwise. */
export function AuthSlot() {
  if (!CLERK_ON)
    return (
      <a className="ghost btn-link sm" href="/dashboard" title="Clerk not configured — local dev mode">
        Dev mode
      </a>
    );
  return <Authed />;
}
