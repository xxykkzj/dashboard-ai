/**
 * Small shared store. Components read `state` and call `setState`;
 * main.mjs subscribes and re-renders the items that depend on what changed.
 */
export const state = {
  range: 30,            // days: 7 | 30 | 90 | 180
  platform: 'all',      // 'all' | 'ios' | 'android'
  tab: 'overview',
  txType: 'rego',       // transaction funnel selector (ITM-08)
  mapMetric: 'per1000', // council map: 'per1000' | 'users' (ITM-22)
  mapView: 'geo',       // council map: 'geo' (real boundaries) | 'tiles' (equal tiles)
  lga: ''               // council selected on the map ('' = none); drives the council profile (ITM-27)
};

const listeners = new Set();

export function setState(patch) {
  const changed = Object.keys(patch).filter(k => state[k] !== patch[k]);
  if (!changed.length) return;
  Object.assign(state, patch);
  listeners.forEach(fn => fn(changed, state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
