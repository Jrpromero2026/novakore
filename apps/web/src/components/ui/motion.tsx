"use client";

import { useEffect, useRef } from "react";

/**
 * Animated counter (Experience Design System — "animated counters & honesty").
 *
 * The REAL value is server-rendered as the element's text, so it is correct and
 * accessible with no JavaScript. After hydration we count up to it with
 * requestAnimationFrame writing straight to the DOM node — no React state, no
 * re-renders, 60fps. `prefers-reduced-motion` (or no JS) simply shows the final
 * value. This is polish over a value that is already correct; it never implies
 * data we do not have.
 */
export function AnimatedNumber({
  value,
  className,
  durationMs = 900,
}: {
  value: number;
  className?: string;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value === 0) {
      node.textContent = String(value);
      return;
    }

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      node.textContent = String(Math.round(value * eased));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        node.textContent = String(value);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
