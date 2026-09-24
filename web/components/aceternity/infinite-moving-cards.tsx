"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function InfiniteMovingCards({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]",
        className
      )}
    >
      {[0, 1].map((copy) => (
        <div
          key={copy}
          aria-hidden={copy === 1}
          className="flex w-max shrink-0 animate-marquee items-center gap-3 pr-3 hover:[animation-play-state:paused] motion-reduce:animate-none"
        >
          {children}
        </div>
      ))}
    </div>
  );
}
