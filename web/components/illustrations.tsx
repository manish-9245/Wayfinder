/* Hand-built illustration set. One visual language: 1.5px strokes in
   currentColor, fills only in semantic verdict colors + soft washes.
   Theme-aware via CSS vars; decorative (aria-hidden by default). */

const S = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.5,
  strokeLinecap: "round", strokeLinejoin: "round",
} as const;

function Svg({ children, vb = "0 0 96 96", label }: { children: React.ReactNode; vb?: string; label?: string }) {
  return (
    <svg viewBox={vb} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      <g {...S}>{children}</g>
    </svg>
  );
}

/** The wf: an archway emitting a calibrated beam with a check. */
export function Archway({ label }: { label?: string }) {
  return (
    <Svg vb="0 0 240 200" label={label}>
      <ellipse cx="120" cy="178" rx="72" ry="10" strokeOpacity=".35" />
      <path d="M62 178V96a58 58 0 0 1 116 0v82" />
      <path d="M78 178v-74a42 42 0 0 1 84 0v74" strokeOpacity=".45" />
      <line x1="120" y1="38" x2="120" y2="14" stroke="var(--color-accent)" />
      <circle cx="120" cy="10" r="3" fill="var(--color-accent)" stroke="none" />
      <line x1="120" y1="70" x2="120" y2="150" stroke="var(--color-accent)" strokeWidth="2.5" />
      <circle cx="120" cy="162" r="9" fill="var(--color-accent)" stroke="none" opacity=".18" />
      <path d="M114.5 162l4 4 7.5-8.5" stroke="var(--color-accent)" strokeWidth="2" />
      <circle cx="34" cy="60" r="2.5" fill="currentColor" stroke="none" opacity=".5" />
      <circle cx="206" cy="48" r="2.5" fill="currentColor" stroke="none" opacity=".5" />
      <circle cx="196" cy="130" r="2" fill="currentColor" stroke="none" opacity=".35" />
      <circle cx="44" cy="132" r="2" fill="currentColor" stroke="none" opacity=".35" />
    </Svg>
  );
}

/** Router: core model with three checkpoint satellites. */
export function Orbit({ label }: { label?: string }) {
  return (
    <Svg label={label}>
      <circle cx="48" cy="48" r="26" strokeOpacity=".4" />
      <circle cx="48" cy="48" r="38" strokeOpacity=".2" />
      <rect x="40" y="40" width="16" height="16" rx="4" />
      <circle cx="48" cy="10" r="6" fill="var(--color-accent)" stroke="none" opacity=".9" />
      <circle cx="82" cy="66" r="6" fill="var(--color-info)" stroke="none" opacity=".9" />
      <circle cx="14" cy="66" r="6" fill="var(--color-warn)" stroke="none" opacity=".9" />
      <path d="M45 46.5l2 2 3.5-4" stroke="var(--color-accent)" />
    </Svg>
  );
}

/** Calibration dial: needle parked near the top of the arc. */
export function Gauge({ label }: { label?: string }) {
  return (
    <Svg label={label}>
      <path d="M14 66a34 34 0 0 1 68 0" />
      <path d="M14 66a34 34 0 0 1 15-22" stroke="var(--color-bad)" />
      <path d="M73 44a34 34 0 0 1 9 22" stroke="var(--color-accent)" />
      <line x1="48" y1="66" x2="66" y2="34" strokeWidth="2.5" />
      <circle cx="48" cy="66" r="5" fill="currentColor" stroke="none" opacity=".85" />
      <circle cx="66" cy="34" r="3" fill="var(--color-accent)" stroke="none" />
    </Svg>
  );
}

/** Firewall shield with a check. */
export function Shield({ label }: { label?: string }) {
  return (
    <Svg label={label}>
      <path d="M48 8l28 10v24c0 18-12 30-28 38C32 72 20 60 20 42V18z" />
      <path d="M38 47l7 7 15-16" stroke="var(--color-accent)" strokeWidth="2" />
    </Svg>
  );
}

/** Batch: stacked layers collapsing into one. */
export function Layers({ label }: { label?: string }) {
  return (
    <Svg label={label}>
      <path d="M48 14l30 12-30 12-30-12z" />
      <path d="M24 46l24 10 24-10" strokeOpacity=".6" />
      <path d="M24 60l24 10 24-10" strokeOpacity=".35" />
      <line x1="48" y1="52" x2="48" y2="80" stroke="var(--color-accent)" strokeWidth="2" />
      <circle cx="48" cy="84" r="3" fill="var(--color-accent)" stroke="none" />
    </Svg>
  );
}

/** Languages: speech bubble with script strokes. */
export function Tongues({ label }: { label?: string }) {
  return (
    <Svg label={label}>
      <path d="M16 12h64v40H52l-12 12v-12H16z" />
      <path d="M26 28h18M26 36h30M26 44h22" stroke="var(--color-info)" />
      <path d="M58 44c4-8 10-8 12 0s6 6 10 2" stroke="var(--color-accent)" />
    </Svg>
  );
}

/** Inbox tray for support inbound. */
export function Inbox({ label }: { label?: string }) {
  return (
    <Svg label={label}>
      <path d="M12 52l10-32h52L64 52" strokeOpacity=".6" />
      <path d="M12 52h72v24H12z" />
      <line x1="30" y1="62" x2="66" y2="62" stroke="var(--color-accent)" strokeWidth="2" />
      <line x1="30" y1="69" x2="54" y2="69" strokeOpacity=".5" />
    </Svg>
  );
}

/** Empty state: open box with a spark. */
export function EmptyBox({ label }: { label?: string }) {
  return (
    <Svg label={label}>
      <path d="M20 40l28-12 28 12v28l-28 12-28-12z" strokeOpacity=".7" />
      <path d="M20 40l28 12 28-12M48 52v28" strokeOpacity=".4" />
      <path d="M66 22v10M61 27h10" stroke="var(--color-accent)" strokeWidth="2" />
    </Svg>
  );
}

/** Lost: dashed arch with a wandering dot. */
export function Lost({ label }: { label?: string }) {
  return (
    <Svg vb="0 0 160 120" label={label}>
      <path d="M40 110V60a40 40 0 0 1 80 0v50" strokeDasharray="5 6" />
      <circle cx="118" cy="34" r="4" fill="var(--color-warn)" stroke="none" />
      <path d="M104 52c6-8 14-10 22-8" stroke="var(--color-warn)" strokeDasharray="3 4" />
    </Svg>
  );
}

const POLICY_ART: Record<string, (p: { label?: string }) => JSX.Element> = {
  llm_firewall: Shield,
  support_inbound: Inbox,
  model_router: Orbit,
  content_safety: Shield,
};

/** Per-policy illustration mark. */
export function PolicyMark({ policy, size = 40 }: { policy: string; size?: number }) {
  const Art = POLICY_ART[policy] || Gauge;
  return (
    <span className="pmark" style={{ width: size, height: size }} aria-hidden="true">
      <Art />
    </span>
  );
}
