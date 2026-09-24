import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import SuperTokensProvider from "@/components/SuperTokensProvider";
import Nav from "@/components/Nav";
import RouteFocus from "@/components/RouteFocus";
import "./globals.css";

const display = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

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
    <html lang="en" data-theme="dark" className={`${display.variable} ${mono.variable}`}>
      <SuperTokensProvider>
        <body>
          <a className="skip" href="#main">Skip to main content</a>
          <div className="grain" aria-hidden="true" />
          <Nav />
          <RouteFocus />
          <main id="main" className="page" tabIndex={-1}>
            {children}
          </main>
          <div className="toast" id="toast" role="status" aria-live="polite" />
        </body>
      </SuperTokensProvider>
    </html>
  );
}
