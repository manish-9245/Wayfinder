"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Move screen-reader/keyboard focus to main content on route change. */
export default function RouteFocus() {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [path]);
  return null;
}
