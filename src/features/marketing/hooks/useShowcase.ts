import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/** Steps through `count` frames every `ms` while visible and not paused; the last frame when motion is reduced. */
export function useShowcase(count: number, ms: number) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  // With reduced motion nothing advances by itself: it opens on the final frame, and the visitor may jump.
  const [step, setStep] = useState(() => (reduced ? count - 1 : 0));
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const running = visible && !paused && !reduced;
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setStep(current => (current + 1) % count), ms);
    return () => window.clearTimeout(timer);
  }, [running, step, count, ms]);
  return { ref, step, setStep, paused, reduced, toggle: () => setPaused(value => !value) };
}

/** Counts up to `to` whenever it changes (instant with reduced motion). */
export function useCount(to: number, reduced: boolean) {
  const [value, setValue] = useState(reduced ? to : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced) { setValue(to); from.current = to; return; }
    const start = performance.now(), begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setValue(Math.round(begin + (to - begin) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick); else from.current = to;
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); from.current = to; };
  }, [to, reduced]);
  return value;
}
