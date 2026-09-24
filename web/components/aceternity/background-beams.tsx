"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Beam = {
  x: number;
  y: number;
  len: number;
  speed: number;
  width: number;
  hue: number;
  drift: number;
};

export function BackgroundBeams({ className }: { className?: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const beams: Beam[] = Array.from({ length: 14 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      len: 0.12 + Math.random() * 0.22,
      speed: 0.0006 + Math.random() * 0.0016,
      width: 1 + Math.random() * 1.5,
      hue: i % 3 === 0 ? 199 : 142,
      drift: (Math.random() - 0.5) * 0.0004,
    }));

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h);
      for (const b of beams) paint(ctx, b, w, h, 0.5);
    };

    let t = Math.random() * 1000;
    const frame = () => {
      if (!running) return;
      t += 1;
      ctx.clearRect(0, 0, w, h);
      for (const b of beams) {
        b.y -= b.speed * 16;
        b.x += b.drift * 16;
        if (b.y + b.len < 0) {
          b.y = 1 + b.len;
          b.x = Math.random();
        }
        paint(ctx, b, w, h, 1);
      }
      raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        running = entry.isIntersecting && !reduced;
        if (running) raf = requestAnimationFrame(frame);
        else {
          cancelAnimationFrame(raf);
          if (!entry.isIntersecting) return;
          drawStatic();
        }
      },
      { threshold: 0 }
    );
    io.observe(canvas);
    if (reduced) drawStatic();
    else raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 h-full w-full opacity-60", className)}
    />
  );
}

function paint(ctx: CanvasRenderingContext2D, b: Beam, w: number, h: number, alpha: number) {
  const x = b.x * w;
  const y0 = b.y * h;
  const y1 = y0 - b.len * h;
  const g = ctx.createLinearGradient(x, y0, x, y1);
  g.addColorStop(0, `hsla(${b.hue}, 90%, 60%, 0)`);
  g.addColorStop(0.5, `hsla(${b.hue}, 90%, 60%, ${0.35 * alpha})`);
  g.addColorStop(1, `hsla(${b.hue}, 90%, 70%, 0)`);
  ctx.strokeStyle = g;
  ctx.lineWidth = b.width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
}
