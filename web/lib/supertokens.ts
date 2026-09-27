import SuperTokens from "supertokens-auth-react";
import { safeNext } from "@/lib/login-redirect";
import EmailPassword from "supertokens-auth-react/recipe/emailpassword";
import { EmailPasswordPreBuiltUI } from "supertokens-auth-react/recipe/emailpassword/prebuiltui";
import ThirdParty from "supertokens-auth-react/recipe/thirdparty";
import { ThirdPartyPreBuiltUI } from "supertokens-auth-react/recipe/thirdparty/prebuiltui";
import Session from "supertokens-auth-react/recipe/session";
import { SessionPreBuiltUI } from "supertokens-auth-react/recipe/session/prebuiltui";

/** Keyless local dev (gateway dev-admin serves platform APIs directly). */
export const AUTH_OFF =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_AUTH_DISABLED === "1";

function origin(): string {
  const env = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_WEBSITE_DOMAIN : "";
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}

function oauthProviders(): { id: string; name: string }[] {
  const raw =
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_OAUTH_PROVIDERS : "") || "";
  const want = new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const out: { id: string; name: string }[] = [];
  if (want.has("google")) out.push({ id: "google", name: "Google" });
  if (want.has("github")) out.push({ id: "github", name: "GitHub" });
  return out;
}

let initialized = false;
let uiList: any[] = [];

export function preBuiltUI(): any[] {
  return uiList;
}

/**
 * Browser talks to the web origin only; `/api/auth/*` is proxied to the
 * gateway's `/auth/*`, so session cookies stay first-party (no CORS, no
 * third-party-cookie issues) in both local dev and Railway.
 */
export function initSuperTokens() {
  if (initialized || AUTH_OFF) return;
  const o = origin();
  const providers = oauthProviders();
  SuperTokens.init({
    appInfo: {
      appName: "Wayfinder",
      apiDomain: o,
      apiBasePath: "/api/auth",
      websiteDomain: o,
      websiteBasePath: "/auth",
    },
    // After a successful sign-in/up, return to the page that asked for
    // login (?next=...) instead of dropping the user on the homepage.
    getRedirectionURL: async (context: any) => {
      if (context.action === "SUCCESS" && typeof window !== "undefined") {
        const next = safeNext(new URLSearchParams(window.location.search).get("next"));
        if (next) return next;
      }
      return undefined;
    },
    recipeList: [
      ...(providers.length
        ? [ThirdParty.init({ signInAndUpFeature: { providers } })]
        : []),
      EmailPassword.init(),
      Session.init(),
    ],
  });
  uiList = [
    ...(providers.length ? [ThirdPartyPreBuiltUI] : []),
    EmailPasswordPreBuiltUI,
    SessionPreBuiltUI,
  ];
  initialized = true;
}
