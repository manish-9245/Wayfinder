# Page override: home (landing)

Parent: `design-system/wayfinder/MASTER.md`. Rules below win on this page only.

- **Display type:** Cabinet Grotesk 700–800 for H1/H2/chapter titles (per
  project display directive; body keeps the Master stack). Never Inter.
- **Hero:** `max-w-6xl`, `clamp(3rem, 6vw, 5.25rem)`, hard 2-line limit; full-bleed
  image + dark radial wash; exactly two CTAs; no badges, tags, or stats.
- **Bento:** 6 columns, `grid-auto-flow: dense`, spans must tile rows exactly
  (current: 4+2 / 4+2 / 3+3). 3–5 cards max.
- **Motion:** GSAP scrub + pin only; all guarded by `prefers-reduced-motion`
  and a `window.gsap` presence check. Content is never hidden in CSS.
- **Imagery:** picsum seeds with `grayscale + contrast` treatment; no raw stock.
