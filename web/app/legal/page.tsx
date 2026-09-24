import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Privacy and terms: Wayfinder" };

export default function Legal() {
  return (
    <Card className="mt-6">
      <CardContent className="doc-body pt-6">
        <h1>Privacy and terms</h1>
        <p className="text-muted-foreground">Last updated September 2026. Plain language, no surprises.</p>
        <h2>Privacy</h2>
        <ul>
          <li>Wayfinder is self-hosted. Text you score stays on infrastructure you control. No vendor cloud receives your states.</li>
          <li>The web console sets no cookies and runs no trackers or analytics. Theme choice lives in your browser&apos;s local storage only.</li>
          <li>Gateway audit logs may record redacted state previews (emails and card-like numbers are scrubbed). Tune retention on your own hosts.</li>
        </ul>
        <h2>Terms</h2>
        <ul>
          <li>Verdicts are decision support, not decisions. Calibrated probabilities still err. Keep a human in the loop for irreversible actions.</li>
          <li>Model weights follow their upstream license (Apache-2.0); this gateway code is Apache-2.0.</li>
          <li>No warranty, no availability promise on self-hosted deployments. Monitor <Link href="/metrics" className="text-info hover:underline">/metrics</Link> and set your own objectives.</li>
        </ul>
        <p className="mt-4">
          <Button variant="outline" asChild>
            <Link href="/">Back home</Link>
          </Button>
        </p>
      </CardContent>
    </Card>
  );
}
