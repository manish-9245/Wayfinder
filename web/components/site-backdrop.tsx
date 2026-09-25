"use client";
import { useEffect, useState } from "react";
import { GradientBackground } from "@/components/ui/noisy-gradient-backgrounds";

/* Site-wide dark backdrop: deep green-charcoal radial glow with an ember
   whisper and animated film grain. Dark mode only (hidden in light mode);
   static single frame under prefers-reduced-motion. Decorative. */
const DARK_COLORS = [
  { color: "rgba(14,42,29,1)", stop: "0%" },
  { color: "rgba(9,24,17,1)", stop: "30%" },
  { color: "rgba(88,38,18,0.5)", stop: "55%" },
  { color: "rgba(5,9,7,1)", stop: "78%" },
  { color: "rgba(3,6,5,1)", stop: "100%" },
];

export default function SiteBackdrop() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="fixed inset-0 -z-10 hidden overflow-hidden dark:block" aria-hidden="true">
      <GradientBackground
        gradientOrigin="top-middle"
        gradientSize="140% 110%"
        colors={DARK_COLORS}
        noisePatternSize={120}
        noisePatternRefreshInterval={reduced ? 0 : 3}
        noisePatternAlpha={16}
        noiseIntensity={0.9}
      />
    </div>
  );
}
