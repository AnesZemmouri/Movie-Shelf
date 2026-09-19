import { useEffect, useState } from "react";

const FULL = "Welcome to my library";
const MS_PER_CHAR = 95;

/**
 * Types the heading one character every 95ms in the italic display face, with a
 * caret that blinks while typing and then pulses once, slowly, forever after.
 *
 * The full string lives in `aria-label` so screen readers get it immediately;
 * the animating slice is `aria-hidden` so they don't hear it spelled out.
 */
export function TypedTitle() {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (n >= FULL.length) return;
    const t = window.setTimeout(() => setN((v) => v + 1), MS_PER_CHAR);
    return () => window.clearTimeout(t);
  }, [n]);

  const done = n >= FULL.length;

  return (
    <h1
      aria-label={FULL}
      className="font-display text-foreground text-[clamp(2.6rem,7vw,5.5rem)] leading-[0.95] font-light tracking-[-0.01em] italic"
    >
      <span aria-hidden="true">{FULL.slice(0, n)}</span>
      <span
        aria-hidden="true"
        className={`ml-1 inline-block w-[2px] translate-y-[0.08em] self-center bg-primary align-middle ${
          done ? "animate-caret-pulse" : ""
        }`}
        style={{ height: "0.85em" }}
      />
    </h1>
  );
}
