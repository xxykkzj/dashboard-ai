/**
 * Motion helpers. All animation checks the reduced-motion setting, and the
 * CSS keyframes in components.css are disabled by base.css for those users.
 */
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduceMotion = () => mq.matches;

/** Count a number up (or down) from its previous value. */
export function countUp(el, from, to, format, duration = 600) {
  if (reduceMotion() || !Number.isFinite(from) || from === to) { el.textContent = format(to); return; }
  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = format(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
