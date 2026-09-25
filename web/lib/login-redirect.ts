"use client";

/** Send the browser to the login page with a human-readable reason.
 * API/MCP clients keep getting plain JSON 401s — this is only for browser
 * UI flows that hit a 401 and need the user to authenticate. Never fires on
 * the login pages themselves (no redirect loops), and carries `next` so the
 * user can come back afterwards. */

const LOGIN_PATHS = ["/auth", "/sign-in", "/sign-up"];

/** Only same-origin paths may be used as post-login destinations.
/// Rejects absolute URLs, protocol-relative URLs, and backslash tricks so
/// a crafted /auth?next=… link can never bounce users to a phishing host. */
export function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(next)) return null;
  return next;
}

export function redirectToLogin(message?: string) {
  if (typeof window === "undefined") return;
  const here = window.location.pathname;
  if (LOGIN_PATHS.some((p) => here === p || here.startsWith(p + "/"))) return;
  const q = new URLSearchParams();
  if (message) q.set("message", message);
  q.set("next", here + window.location.search);
  window.location.assign(`/auth?${q.toString()}`);
}

export function loginUrl(message?: string, next?: string) {
  const q = new URLSearchParams();
  if (message) q.set("message", message);
  const safe = safeNext(next ?? null);
  if (safe) q.set("next", safe);
  const s = q.toString();
  return s ? `/auth?${s}` : "/auth";
}
