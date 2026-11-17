/**
 * Targets and status.
 *
 * Targets come from the data layer (vw_Targets; data/mock/targets.json in the
 * prototype). A measure is "On track" at or above its target, "Action" below
 * its action level and "Watch" in between. Status is always shown as a shape
 * plus a word, never colour alone. A target with direction 'lower' (costs)
 * is the other way round: On track at or below target, Action above the
 * action level.
 */
import { fmt, pct, pctTidy, fmtCents, escapeHtml } from './format.mjs';

export const STATUS = {
  good: { label: 'On track', rank: 0 },
  watch: { label: 'Watch', rank: 1 },
  action: { label: 'Action', rank: 2 },
  info: { label: 'Estimate', rank: -1 }
};

const SHAPES = {
  good: '<circle cx="8" cy="8" r="7"/><path class="mk" d="M4.7 8.4l2.2 2.2 4.5-4.9"/>',
  watch: '<path d="M8 .8 15.2 8 8 15.2.8 8z"/><path class="mk" d="M8 4.6v4.1M8 11v.3"/>',
  action: '<path d="M8 1.3 15.4 14.6H.6z"/><path class="mk" d="M8 6.2v4M8 12.2v.3"/>',
  info: '<rect x="1.5" y="1.5" width="13" height="13" rx="2.5"/><path class="mk" d="M5.2 6.4h5.6M5.2 9.6h5.6"/>'
};

export const statusIcon = s => `<svg class="st-i" viewBox="0 0 16 16" aria-hidden="true">${SHAPES[s] || SHAPES.info}</svg>`;

/** Shape + word, e.g. ◆ Watch */
export function statusChip(status, text) {
  const s = STATUS[status] ? status : 'info';
  return `<span class="st st-${s}">${statusIcon(s)}<span>${escapeHtml(text || STATUS[s].label)}</span></span>`;
}

export const findTarget = (targets, key) => (targets || []).find(t => t.key === key) || null;

/**
 * Compare a measure with its target.
 *   m.value                 for basis 'value' (rates and ratios)
 *   m.current, m.days       for basis 'perDay'
 *   m.current, m.previous   for basis 'growth'
 */
export function evaluate(t, m) {
  if (!t) return null;
  const measured = t.basis === 'perDay' ? m.current / (m.days || 1)
    : t.basis === 'growth' ? (m.previous ? (m.current - m.previous) / m.previous : NaN)
    : m.value;
  if (!Number.isFinite(measured)) return null;
  const status = t.direction === 'lower'
    ? (measured <= t.target ? 'good' : measured > t.action ? 'action' : 'watch')
    : (measured >= t.target ? 'good' : measured < t.action ? 'action' : 'watch');
  return { status, measured, target: t.target, text: targetText(t), now: nowText(t, measured) };
}

export function targetText(t) {
  if (t.basis === 'perDay') return `Target ${fmt(t.target)} a day`;
  if (t.basis === 'growth') return `Target: grow ${pctTidy(t.target)} or more`;
  if (t.unit === 'cents') return `Target ${fmtCents(t.target)}${t.direction === 'lower' ? ' or less' : ''}`;
  return `Target ${pctTidy(t.target)}`;
}

function nowText(t, v) {
  if (t.basis === 'perDay') return `now ${fmt(v)} a day`;
  if (t.basis === 'growth') return `now ${v >= 0 ? '+' : '−'}${pct(Math.abs(v))}`;
  if (t.unit === 'cents') return `now ${fmtCents(v)}`;
  return `now ${pct(v)}`;
}

export const worst = list => list.filter(Boolean).sort((a, b) => STATUS[b].rank - STATUS[a].rank)[0] || null;
