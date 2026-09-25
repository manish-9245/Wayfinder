/* The Doubtling: Wayfinder's pocket mascot — a minion-style yellow buddy
   with twin goggles (mismatched green/orange irises), hair tuft, blue
   overalls, waving glove and boots. Drawn inline (no assets).
   Motion is pure CSS (bob / blink / look-around / wave); frozen under
   prefers-reduced-motion. Decorative: always aria-hidden. */

"use client";
import { useState } from "react";

const INK = "#23262b";
const YELLOW = "#F7C948";
const DENIM = "#3E7CB1";
const DENIM_DARK = "#2F6391";
const SILVER = "#C7CDD6";

export function Doubtling({
  size = 64,
  className = "",
  mood = "happy",
}: {
  size?: number;
  className?: string;
  mood?: "happy" | "curious" | "sleepy";
}) {
  return (
    <svg
      width={size}
      height={size * 1.25}
      viewBox="0 0 120 150"
      aria-hidden="true"
      focusable="false"
      className={`mascot ${className}`}
    >
      {/* hair tuft */}
      <g stroke={INK} strokeWidth="2.5" strokeLinecap="round" fill="none">
        <path d="M52 12 Q50 4 56 2" />
        <path d="M60 11 Q62 3 69 3" />
        <path d="M67 13 Q73 8 79 9" />
      </g>
      {/* boots */}
      <rect x="38" y="132" width="20" height="13" rx="6" fill={INK} />
      <rect x="62" y="132" width="20" height="13" rx="6" fill={INK} />
      {/* left arm (down) */}
      <line x1="30" y1="92" x2="20" y2="112" stroke={YELLOW} strokeWidth="11" strokeLinecap="round" />
      <circle cx="19" cy="114" r="8" fill={INK} />
      {/* body capsule */}
      <rect x="28" y="10" width="64" height="98" rx="30" fill={YELLOW} stroke={INK} strokeWidth="3" />
      {/* right arm (waving) */}
      <g className="mascot-wave" style={{ transformOrigin: "90px 88px" }}>
        <line x1="90" y1="88" x2="104" y2="70" stroke={YELLOW} strokeWidth="11" strokeLinecap="round" />
        <circle cx="106" cy="67" r="9" fill={INK} />
      </g>
      {/* overalls */}
      <path d="M30 108 Q30 92 46 90 L74 90 Q90 92 90 108 L90 122 Q90 134 78 134 L42 134 Q30 134 30 122 Z" fill={DENIM} stroke={INK} strokeWidth="3" />
      <rect x="46" y="78" width="28" height="22" rx="5" fill={DENIM} stroke={INK} strokeWidth="3" />
      <line x1="42" y1="90" x2="34" y2="66" stroke={DENIM_DARK} strokeWidth="9" strokeLinecap="round" />
      <line x1="78" y1="90" x2="86" y2="66" stroke={DENIM_DARK} strokeWidth="9" strokeLinecap="round" />
      <circle cx="52" cy="84" r="2.6" fill={INK} />
      <circle cx="68" cy="84" r="2.6" fill={INK} />
      <rect x="62" y="104" width="20" height="16" rx="7" fill="none" stroke={INK} strokeWidth="2.4" />
      {/* goggle strap */}
      <rect x="12" y="44" width="96" height="12" rx="6" fill="#9AA1AD" stroke={INK} strokeWidth="3" />
      {/* goggles */}
      <circle cx="46" cy="50" r="17" fill={SILVER} stroke={INK} strokeWidth="3" />
      <circle cx="78" cy="50" r="17" fill={SILVER} stroke={INK} strokeWidth="3" />
      <rect x="58" y="45" width="10" height="10" rx="3" fill={SILVER} stroke={INK} strokeWidth="2.5" />
      <g className="mascot-blink" style={{ transformOrigin: "62px 50px" }}>
        <circle cx="46" cy="50" r="11" fill="#fff" />
        <circle cx="78" cy="50" r="11" fill="#fff" />
        <g className="mascot-look">
          <circle cx="46" cy="50" r="6" fill="#7A9A01" />
          <circle cx="78" cy="50" r="6" fill="#C96A1B" />
          <circle cx="46" cy="50" r="3.2" fill="#141414" />
          <circle cx="78" cy="50" r="3.2" fill="#141414" />
          <circle cx="44.5" cy="48" r="1.3" fill="#fff" />
          <circle cx="76.5" cy="48" r="1.3" fill="#fff" />
        </g>
      </g>
      {mood === "sleepy" && (
        <g stroke={INK} strokeWidth="2.6" strokeLinecap="round">
          <line x1="37" y1="50" x2="55" y2="50" />
          <line x1="69" y1="50" x2="87" y2="50" />
        </g>
      )}
      {/* blush + smile */}
      <ellipse cx="38" cy="72" rx="4.5" ry="3" fill="#E85D9E" opacity="0.45" />
      <ellipse cx="88" cy="72" rx="4.5" ry="3" fill="#E85D9E" opacity="0.45" />
      {mood === "sleepy" ? (
        <ellipse cx="63" cy="80" rx="4" ry="5" fill="none" stroke={INK} strokeWidth="2.6" />
      ) : (
        <path d="M50 78 Q63 88 80 76" fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

/* Corner buddy: rides along on every page holding a "star this repo" sign.
   The sign dismisses (session-only); the buddy stays and keeps bobbing. */
export function CornerBuddy() {
  const [show, setShow] = useState(true);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-30 hidden sm:block">
      <div className="flex flex-col items-end gap-1">
        {show && (
          <div className="mascot-bob pointer-events-auto flex items-center gap-2 rounded-xl border border-white/15 bg-card/70 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <span className="text-ember" aria-hidden="true">★</span>
            <a
              href="https://github.com/manish-9245/Wayfinder"
              target="_blank"
              rel="noreferrer"
              className="font-tsj-mono text-[11px] font-semibold text-foreground hover:text-ember hover:underline"
            >
              star this repo
            </a>
            <button
              type="button"
              onClick={() => setShow(false)}
              aria-label="Dismiss star sign"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              ×
            </button>
          </div>
        )}
        <div className="mascot-bob text-muted-foreground/80" aria-hidden="true">
          <Doubtling size={84} className="drop-shadow-lg" />
        </div>
      </div>
    </div>
  );
}
