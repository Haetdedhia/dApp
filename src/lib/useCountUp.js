import { useEffect, useRef, useState } from 'react';

const DURATION = 620;

/** Matches the OS "reduce motion" setting. */
function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Animates a number from 0 to `target` on arrival.
 *
 * Deliberately small: a KPI that lands at its value feels inert, and a short
 * count-up is what makes a dashboard read as live. Runs once per value change,
 * not on every render.
 *
 * Returns the target immediately — no animation — when the OS asks for reduced
 * motion, or while `waiting` is true (so numbers do not count up to a stale
 * value mid-load and then jump).
 *
 * requestAnimationFrame is cancelled on unmount and on every re-run, so a fast
 * refresh cannot leave two loops writing to the same state.
 */
export default function useCountUp(target, waiting = false) {
  const [value, setValue] = useState(target);
  const frame = useRef(0);

  useEffect(() => {
    if (waiting) return undefined;

    if (prefersReducedMotion() || target === 0) {
      setValue(target);
      return undefined;
    }

    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / DURATION, 1);
      // easeOutCubic: fast out of the gate, settles gently on the final value.
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, waiting]);

  return value;
}
