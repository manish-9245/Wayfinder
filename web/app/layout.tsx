import type { Metadata } from "next";
// Self-hosted (next/font/local): the Railway builder cannot reliably reach
// Google Fonts at build time, and a font fetch failure fails the whole
// build. Variable files in ./fonts cover every weight below.
import localFont from "next/font/local";
import { Toaster } from "sonner";
import SuperTokensProvider from "@/components/SuperTokensProvider";
import SiteBackdrop from "@/components/site-backdrop";
import { CornerBuddy } from "@/components/mascots";
import SiteHeader from "@/components/site-header";
import RouteFocus from "@/components/RouteFocus";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const display = localFont({ src: "./fonts/outfit-variable.woff2", variable: "--font-display", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains_mono-variable.woff2", variable: "--font-mono", display: "swap" });
// Editorial homepage type (style-transfer): display/UI/mono voices for the landing page only.
const tsjDisplay = localFont({ src: "./fonts/bricolage_grotesque-variable.woff2", variable: "--font-tsj-display", display: "swap" });
const tsjGrot = localFont({ src: "./fonts/space_grotesk-variable.woff2", variable: "--font-tsj-grot", display: "swap" });
const tsjMono = localFont({
  src: [
    { path: "./fonts/ibm_plex_mono-400.woff2", weight: "400" },
    { path: "./fonts/ibm_plex_mono-500.woff2", weight: "500" },
  ],
  variable: "--font-tsj-mono",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Wayfinder: universal doubt layer", template: "%s — Wayfinder" },
  description:
    "One HTTP call turns any text in 100+ languages into a calibrated act / review / escalate / block verdict.",
  keywords: ["AI guardrails", "LLM firewall", "content moderation", "model router", "support triage", "multilingual classification", "MCP server", "calibrated decisions"],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Wayfinder: doubt, as a service",
    description: "Calibrated act / review / escalate / block verdicts over any text, in 100+ languages, in one forward pass.",
    type: "website",
    siteName: "Wayfinder",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Wayfinder: doubt, as a service" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wayfinder",
    description: "Calibrated verdicts for every AI action.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
      <html lang="en" suppressHydrationWarning className={`${display.variable} ${mono.variable} ${tsjDisplay.variable} ${tsjGrot.variable} ${tsjMono.variable}`}>
      <body>
        <SiteBackdrop />
        <ThemeProvider>
          <SuperTokensProvider>
            <a
              href="#main"
              className="absolute -top-14 left-3 z-50 rounded-md border bg-secondary px-4 py-2.5 text-foreground transition-all focus:top-3"
            >
              Skip to main content
            </a>
            <SiteHeader />
            <RouteFocus />
            <main id="main" tabIndex={-1} className="w-full px-4 pb-16 pt-6 md:px-8">
              {children}
            </main>
            <Toaster richColors closeButton />
            <CornerBuddy />
          </SuperTokensProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
