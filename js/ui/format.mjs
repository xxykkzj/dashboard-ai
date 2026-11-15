/** Number, date and text helpers shared by every component. */
const nf = new Intl.NumberFormat('en-AU');

export const fmt = n => nf.format(Math.round(n));

/** Compact numbers: 1.08M, 245k, 1.2k */
export function fmtC(n) {
  const a = Math.abs(n);
  let s, unit;
  if (a >= 1e6) { s = (n / 1e6).toFixed(a >= 1e7 ? 0 : 2); unit = 'M'; }
  else if (a >= 1e4) return Math.round(n / 1e3) + 'k';
  else if (a >= 1e3) { s = (n / 1e3).toFixed(1); unit = 'k'; }
  else return String(Math.round(n));
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s + unit;
}

export const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
export const sum = a => a.reduce((x, y) => x + y, 0);
export const avg = a => (a.length ? sum(a) / a.length : 0);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** '2026-11-14' → '14 Nov' (or '14 Nov 2026' with year = true) */
export function dfmt(iso, year = false) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-AU', year ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Breakpoints that split values into `bins` groups of similar size */
export function quantileBreaks(values, bins = 5) {
  const v = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return [];
  return Array.from({ length: bins - 1 }, (_, i) => v[Math.floor(((i + 1) / bins) * (v.length - 1))]);
}

/** Dollars, compact: $1.24M, $318k, $4,200 */
export function fmtMoney(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (a >= 1e4) return '$' + Math.round(n / 1e3) + 'k';
  return '$' + nf.format(Math.round(n));
}

/** Percent without a trailing .0, for targets: 93.5%, 35% */
export const pctTidy = x => (x * 100).toFixed(1).replace(/\.0$/, '') + '%';

/** Add days to an ISO date without time-zone drift */
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** '2026-10-30', '2026-10-31' → '30–31 Oct'; across months → '28 Sep – 4 Oct' */
export function dRange(from, to, year = false) {
  if (!to || from === to) return dfmt(from, year);
  const a = new Date(from + 'T00:00:00'), b = new Date(to + 'T00:00:00');
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${dfmt(to, year)}`;
  return `${dfmt(from)} – ${dfmt(to, year)}`;
}

const WORDS = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
export const numWord = n => WORDS[n] ?? String(n);

/** ['a', 'b', 'c'] → 'a, b and c' */
export const listWords = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
