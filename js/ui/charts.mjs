/**
 * Chart primitives drawn with plain SVG and HTML, no library.
 * Colours come from CSS tokens, so charts follow light and dark themes.
 * Every chart gets a text summary (aria-label) for screen readers.
 *
 * Line and bar charts accept:
 *   events   [{ from, to, label, kind }]  shaded and labelled on the chart
 *   target   { value, label }             dashed target line
 * Line charts also accept compare { name, values } for the previous period.
 */
import { fmt, fmtC, pct, sum, clamp, dfmt, dRange, escapeHtml, quantileBreaks } from './format.mjs';
import { countUp } from './motion.mjs';
import { statusChip } from './status.mjs';

export function niceTicks(lo, hi, count) {
  const span = (hi - lo) || 1, raw = span / count, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, out = [];
  for (let v = a; v <= b + step / 1e6; v += step) out.push(+v.toFixed(6));
  return out;
}

/** Legend. Items are [name, colour] or [name, colour, 'dash' | 'band']. */
export const legend = items =>
  `<div class="legend">${items.map(([n, c, k]) => `<span><i class="${k || ''}" style="--c:${c}"></i>${escapeHtml(n)}</span>`).join('')}</div>`;

// Draw at the card's real width so labels stay a readable size in narrow cards
const widthOf = host => clamp(Math.round(host.clientWidth || 640), 300, 1040);
const textW = s => s.length * 6.3;     // rough width of an 11.5px label

/** Event labels sit in rows above the plot; rows alternate so neighbours don't collide. */
function eventLayer(events, { x0of, x1of, top, bottom, left, right }) {
  let g = '';
  const rows = events.length > 1 ? 2 : 1;
  events.forEach((e, k) => {
    const a = x0of(e), b = x1of(e);
    if (a == null) return;
    const row = rows === 2 ? k % 2 : 0, ly = top - 9 - (rows - 1 - row) * 15;
    const w = textW(e.label), start = a + w <= right;
    const tx = start ? Math.max(left, a) : Math.min(right, b);
    g += `<rect class="ev ev-${e.kind}" x="${a}" y="${top}" width="${Math.max(3, b - a)}" height="${bottom - top}"/>
      <line class="ev-stem ev-${e.kind}" x1="${start ? a : b}" x2="${start ? a : b}" y1="${ly + 3}" y2="${top}"/>
      <text class="ev-label" x="${tx + (start ? 4 : -4)}" y="${ly}" text-anchor="${start ? 'start' : 'end'}">${escapeHtml(e.label)}</text>`;
  });
  return g;
}
const eventKey = events => (events.length
  ? `<ul class="evkey">${events.map(e => `<li><i class="ev-${e.kind}"></i><b>${escapeHtml(e.label)}</b>, ${dRange(e.from, e.to)}${e.note ? `. ${escapeHtml(e.note)}` : ''}</li>`).join('')}</ul>` : '');
const eventWords = events => events.map(e => ` ${e.label}, ${dRange(e.from, e.to)}.`).join('');

/* ---------- line chart with hover guide ---------- */
export function lineChart(host, { dates, series, yFmt = fmtC, tipFmt = fmt, title = 'Line chart', events = [], target, compare, zero = true }) {
  const n = dates.length;
  if (!n) { host.innerHTML = '<p class="empty">No data for this period.</p>'; return; }
  events = events.filter(e => e.to >= dates[0] && e.from <= dates[n - 1]);
  if (compare && compare.values.length !== n) compare = null;
  const W = widthOf(host), H = W < 480 ? 230 : 260, pl = 46, pb = 26;
  const ends = series.length > 1 && W >= 520;                 // name each line at its end when there is room
  const pr = ends ? 14 + Math.max(...series.map(s => textW(s.name))) : 16;
  const pt = 14 + (events.length ? (events.length > 1 ? 32 : 18) : 0);
  const L = dates.map(d => dfmt(d));
  const vals = series.flatMap(s => s.values).concat(compare ? compare.values : [], target ? [target.value] : []);
  const ticks = niceTicks(zero ? 0 : Math.min(...vals), Math.max(...vals, zero ? 1 : -Infinity), 4), lo = ticks[0], hi = ticks[ticks.length - 1];
  const step = n < 2 ? 0 : (W - pl - pr) / (n - 1);
  const X = i => pl + i * step;
  const Y = v => pt + (H - pt - pb) * (1 - (v - lo) / ((hi - lo) || 1));

  let g = '';
  const idx = (iso, first) => { const i = first ? dates.findIndex(d => d >= iso) : dates.findLastIndex(d => d <= iso); return i; };
  g += eventLayer(events, {
    x0of: e => { const i = idx(e.from, true); return i < 0 ? null : Math.max(pl, X(i) - step / 2); },
    x1of: e => Math.min(W - pr, X(idx(e.to, false)) + step / 2),
    top: pt, bottom: H - pb, left: pl, right: W - pr
  });
  ticks.forEach(t => {
    g += `<line class="grid-l${t === lo ? ' base' : ''}" x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ytick" x="${pl - 8}" y="${Y(t) + 4}">${yFmt(t)}</text>`;
  });
  const xt = Math.min(W < 480 ? 4 : 6, n);
  for (let k = 0; k < xt; k++) {
    const i = Math.round(k * (n - 1) / Math.max(1, xt - 1));
    g += `<text class="xtick" x="${X(i)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === xt - 1 ? 'end' : 'middle'}">${L[i]}</text>`;
  }
  if (target) {
    g += `<line class="tgt" x1="${pl}" x2="${W - pr}" y1="${Y(target.value)}" y2="${Y(target.value)}"/>`;
  }
  const pts = v => v.map((y, i) => `${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  if (compare) g += `<polyline class="ln cmp" points="${pts(compare.values)}"/>`;
  series.forEach(s => {
    if (series.length === 1 && zero) g += `<polygon class="area" style="fill:${s.color}" points="${X(0)},${Y(lo)} ${pts(s.values)} ${X(n - 1)},${Y(lo)}"/>`;
    g += `<polyline class="ln draw" pathLength="1" style="stroke:${s.color}" points="${pts(s.values)}"/>`;
    g += `<circle class="end" cx="${X(n - 1)}" cy="${Y(s.values[n - 1])}" r="4" style="fill:${s.color}"/>`;
    if (ends) g += `<text class="end-label" x="${X(n - 1) + 9}" y="${Y(s.values[n - 1]) + 4}">${escapeHtml(s.name)}</text>`;
  });

  const summary = `${title}, ${L[0]} to ${L[n - 1]}. ` + series.map(s =>
    `${s.name}: latest ${tipFmt(s.values[n - 1])}, highest ${tipFmt(Math.max(...s.values))}, lowest ${tipFmt(Math.min(...s.values))}`).join('. ') + '.' +
    (target ? ` ${target.label}.` : '') + eventWords(events);

  const leg = [];
  if (series.length > 1 || compare) series.forEach(s => leg.push([s.name, s.color]));
  if (compare) leg.push([compare.name, 'var(--neutral)', 'dash']);
  if (target) { if (!leg.length) leg.push([series[0].name, series[0].color]); leg.push([target.label, 'var(--ink)', 'dash']); }

  host.innerHTML = `<div class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(summary)}">${g}
      <line class="guide" y1="${pt}" y2="${H - pb}" x1="0" x2="0" style="display:none"/>
      <g class="dots"></g>
      <rect class="hit" x="${pl}" y="0" width="${W - pl - pr}" height="${H - pb}"/>
    </svg><div class="tip" hidden></div></div>` + (leg.length ? legend(leg) : '') + eventKey(events);

  const svg = host.querySelector('svg'), tip = host.querySelector('.tip');
  const guide = svg.querySelector('.guide'), dots = svg.querySelector('.dots');
  svg.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
    const i = clamp(Math.round((px - pl) / (step || 1)), 0, n - 1);
    guide.setAttribute('x1', X(i)); guide.setAttribute('x2', X(i)); guide.style.display = '';
    dots.innerHTML = series.map(s => `<circle class="dot" cx="${X(i)}" cy="${Y(s.values[i])}" r="4.5" style="fill:${s.color}"/>`).join('');
    const here = events.filter(ev => dates[i] >= ev.from && dates[i] <= ev.to);
    tip.innerHTML = `<b>${L[i]}</b>` + series.map(s => `<div><i style="--c:${s.color}"></i>${escapeHtml(s.name)}<span>${tipFmt(s.values[i])}</span></div>`).join('') +
      (compare ? `<div><i class="dash" style="--c:var(--neutral)"></i>${escapeHtml(compare.name)}<span>${tipFmt(compare.values[i])}</span></div>` : '') +
      here.map(ev => `<em>${escapeHtml(ev.label)}</em>`).join('');
    tip.hidden = false;
    tip.style.left = clamp(X(i) / W * r.width, 90, r.width - 90) + 'px';
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; guide.style.display = 'none'; dots.innerHTML = ''; });
}

/* ---------- vertical bar chart ---------- */
// dates + spanDays let the chart place events: each bar covers spanDays from its date.
export function barChart(host, { labels, values, name, title = 'Bar chart', target, events = [], dates = [], spanDays = 1 }) {
  const n = values.length;
  if (!n) { host.innerHTML = '<p class="empty">No data for this period.</p>'; return; }
  const endOf = iso => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + spanDays - 1); return d.toISOString().slice(0, 10); };
  const hits = e => dates.map((d, i) => (e.from <= endOf(d) && e.to >= d ? i : -1)).filter(i => i >= 0);
  events = events.filter(e => hits(e).length);
  const W = widthOf(host), H = W < 480 ? 230 : 260, pl = 46, pr = 10, pb = 26;
  const pt = 14 + (events.length ? (events.length > 1 ? 32 : 18) : 0);
  const ticks = niceTicks(0, Math.max(...values, target ? target.value : 1, 1), 4), hi = ticks[ticks.length - 1];
  const bw = (W - pl - pr) / n, Y = v => pt + (H - pt - pb) * (1 - v / hi);
  const mx = values.indexOf(Math.max(...values));
  const marked = new Set(events.flatMap(hits));
  let g = eventLayer(events, {
    x0of: e => pl + hits(e)[0] * bw + bw * .08,
    x1of: e => pl + (hits(e).at(-1) + 1) * bw - bw * .08,
    top: pt, bottom: H - pb, left: pl, right: W - pr
  });
  ticks.forEach(t => {
    g += `<line class="grid-l${t === 0 ? ' base' : ''}" x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ytick" x="${pl - 8}" y="${Y(t) + 4}">${fmtC(t)}</text>`;
  });
  const w = Math.min(bw * .72, 56);
  values.forEach((v, i) => {
    const x = pl + i * bw + (bw - w) / 2, y = Y(v), h = Y(0) - y, r = Math.min(4, w / 2, h);
    g += `<path class="bar" data-i="${i}" d="M${x},${Y(0)}V${y + r}q0,${-r} ${r},${-r}h${w - 2 * r}q${r},0 ${r},${r}V${Y(0)}z"/>`;
  });
  if (target) {
    g += `<line class="tgt" x1="${pl}" x2="${W - pr}" y1="${Y(target.value)}" y2="${Y(target.value)}"/>`;
  }
  const step = Math.ceil(n / (W < 480 ? 4 : 6));
  labels.forEach((l, i) => { if (i % step === 0) g += `<text class="xtick" x="${pl + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${l}</text>`; });
  const summary = `${title}. Highest: ${labels[mx]}, ${fmt(values[mx])}. Latest: ${labels[n - 1]}, ${fmt(values[n - 1])}.` +
    (target ? ` ${target.label}: ${fmt(target.value)}.` : '') + eventWords(events);
  host.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(summary)}">${g}</svg><div class="tip" hidden></div></div>` +
    (target ? legend([[name, 'var(--accent)'], [target.label, 'var(--ink)', 'dash']]) : '') + eventKey(events);
  const svg = host.querySelector('svg'), tip = host.querySelector('.tip');
  svg.addEventListener('pointerover', e => {
    const i = e.target.dataset && e.target.dataset.i;
    if (i == null) return;
    const r = svg.getBoundingClientRect();
    tip.innerHTML = `<b>${labels[i]}</b><div>${escapeHtml(name)}<span>${fmt(values[i])}</span></div>` +
      (target ? `<div>${escapeHtml(target.label)}<span>${fmt(target.value)}</span></div>` : '') +
      (marked.has(+i) ? events.filter(ev => hits(ev).includes(+i)).map(ev => `<em>${escapeHtml(ev.label)}</em>`).join('') : '');
    tip.hidden = false;
    tip.style.left = clamp((pl + i * bw + bw / 2) / W * r.width, 80, r.width - 80) + 'px';
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
}

/* ---------- KPI tile with sparkline ---------- */
export function spark(values, { color = 'var(--accent)', targetLine } = {}) {
  const W = 240, H = 44, n = values.length;
  if (n < 2) return '';
  const all = Number.isFinite(targetLine) ? [...values, targetLine] : values;
  const lo = Math.min(...all), hi = Math.max(...all);
  const X = i => 2 + i * (W - 8) / (n - 1), Y = v => H - 5 - (H - 10) * ((v - lo) / ((hi - lo) || 1));
  const pts = values.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    ${Number.isFinite(targetLine) ? `<line class="tgt" x1="0" x2="${W}" y1="${Y(targetLine)}" y2="${Y(targetLine)}"/>` : ''}
    <polyline class="ln" style="stroke:${color}" points="${pts}"/><circle cx="${X(n - 1)}" cy="${Y(values[n - 1])}" r="3.2" style="fill:${color}"/></svg>`;
}

/**
 * KPI tile. `evaluation` comes from evaluate() in status.mjs and adds the
 * status chip and target line; leave it out for a measure with no target.
 */
export function kpi(host, { value, format = fmt, delta, deltaText, goodUp = true, sparkData = [], range, evaluation, sparkTarget }) {
  const flat = !Number.isFinite(delta) || Math.abs(delta) < 0.0005;
  const up = delta >= 0, good = goodUp ? up : !up;
  const word = flat ? 'No change' : up ? 'Up' : 'Down';
  const ev = evaluation;
  host.innerHTML = `<div class="kpi">
    <div class="kval">${format(value)}</div>
    <div class="krow"><span class="delta ${flat ? 'flat' : good ? 'good' : 'bad'}"><span aria-hidden="true">${flat ? '→' : up ? '▲' : '▼'}</span><span class="sr-only">${word}</span> ${Number.isFinite(delta) ? deltaText : 'n/a'}</span>
    <span class="vs">on the previous ${range} days</span></div>
    ${spark(sparkData, { targetLine: sparkTarget })}
    ${ev ? `<div class="ktarget">${statusChip(ev.status)}<span class="ktext">${escapeHtml(ev.text)}, ${escapeHtml(ev.now)}</span></div>` : ''}</div>`;
  countUp(host.querySelector('.kval'), host._prev, value, format);
  host._prev = value;
}

/* ---------- horizontal bars (single or stacked) ---------- */
// A row with `go: { hash?, set?, label }` becomes a link or button for drill-down.
export function hbars(host, rows, extra = '', { max: fixedMax } = {}) {
  const max = fixedMax || Math.max(1, ...rows.map(r => (r.parts ? sum(r.parts.map(p => p.value)) : r.value)));
  host.innerHTML = `<div class="hbars">${rows.map(r => {
    const inner = r.parts
      ? r.parts.map(p => `<span style="--w:${p.value / max * 100}%;background:${p.color}" title="${escapeHtml(p.name)}: ${p.text ?? fmt(p.value)}"></span>`).join('')
      : `<span style="--w:${r.value / max * 100}%;background:${r.color || 'var(--accent)'}"></span>`;
    const cells = `<span class="hl">${escapeHtml(r.label)}${r.sub ? `<small>${r.sub}</small>` : ''}</span>
      <span class="htrack${r.parts ? ' stack' : ''}" aria-hidden="true">${inner}</span><span class="hv">${r.text ?? fmtC(r.value)}</span>`;
    if (!r.go) return `<div class="hrow${r.on ? ' on' : ''}">${cells}</div>`;
    const set = r.go.set ? ` data-set="${escapeHtml(JSON.stringify(r.go.set))}"` : '';
    const tip = ` title="${escapeHtml(r.go.label)}"`;
    return r.go.hash
      ? `<a class="hrow go" href="#${r.go.hash}"${set}${tip}>${cells}<span class="sr-only">. ${escapeHtml(r.go.label)}</span></a>`
      : `<button type="button" class="hrow go${r.on ? ' on' : ''}"${set}${tip} aria-pressed="${!!r.on}">${cells}<span class="sr-only">. ${escapeHtml(r.go.label)}</span></button>`;
  }).join('')}</div>${extra}`;
}

/* ---------- funnel ---------- */
/**
 * Each step is a layer that narrows from its own share of the start to the
 * next step's share, so the layers join into one funnel. The line on each
 * boundary gives the share and number that stopped there.
 *   noun   what is being counted ('people', 'transactions', 'reminders')
 */
export function funnel(host, steps, { noun = 'people' } = {}) {
  if (!steps.length || !steps[0].value) { host.innerHTML = '<p class="empty">No data for this period.</p>'; return; }
  const top = steps[0].value, last = steps[steps.length - 1];
  let worstRate = 1, wi = 1;
  steps.forEach((s, i) => { if (i) { const c = s.value / steps[i - 1].value; if (c < worstRate) { worstRate = c; wi = i; } } });

  // Widths are shares of the first step; the last layer tapers slightly to close the shape.
  const width = i => (i < steps.length ? steps[i].value / top : last.value / top * 0.86);
  // the percentage is printed inside a layer only where the layer is wide enough to hold it
  const hostW = host.clientWidth || 560, layerW = hostW * (hostW <= 480 ? 0.38 : 0.44);
  const layer = i => {
    const w1 = width(i), w2 = width(i + 1);
    const l1 = ((1 - w1) / 2 * 100).toFixed(2), l2 = ((1 - w2) / 2 * 100).toFixed(2);
    const shade = Math.max(48, 100 - i * 11);
    return `<span class="fnl-shape" style="clip-path:polygon(${l1}% 0,${100 - l1}% 0,${100 - l2}% 100%,${l2}% 100%);background:color-mix(in srgb, var(--accent) ${shade}%, var(--surface))">
      ${w1 * layerW > 44 ? `<span class="fnl-in${shade < 70 ? ' dark' : ''}">${pct(w1, 0)}</span>` : ''}</span>`;
  };

  const summary = `Funnel from ${steps[0].label} (${fmt(top)} ${noun}) to ${last.label} (${fmt(last.value)}, ${pct(last.value / top)}). ` +
    steps.slice(1).map((s, k) => `${s.label}: ${fmt(s.value)}, ${pct(1 - s.value / steps[k].value)} stopped before this step`).join('; ') +
    `. Largest drop: ${steps[wi - 1].label} to ${steps[wi].label}.`;

  host.innerHTML = `<div class="fsum"><span>Overall conversion <b>${pct(last.value / top)}</b></span>
    <span>Largest drop <b>${escapeHtml(steps[wi - 1].label)} to ${escapeHtml(steps[wi].label)}</b> (${pct(1 - worstRate)})</span></div>
    <ol class="fnl" aria-label="${escapeHtml(summary)}">${steps.map((s, i) => {
      const prev = i ? steps[i - 1].value : s.value;
      return `<li class="fnl-row${i === wi ? ' hot' : ''}">
        <div class="fnl-layer" aria-hidden="true">${layer(i)}</div>
        <div class="fnl-text">
          ${i ? `<span class="fnl-drop${i === wi ? ' hot' : ''}">${pct(1 - s.value / prev)} stopped <span class="fnl-lost">(${fmt(prev - s.value)})</span>${i === wi ? ' <span class="tagline">Largest drop</span>' : ''}</span>` : ''}
          <span class="fname">${escapeHtml(s.label)}</span>
          <span class="fval">${fmt(s.value)} <em>${pct(s.value / top, 0)} of start</em></span>
        </div></li>`;
    }).join('')}</ol>`;
}

/* ---------- cohort retention grid ---------- */
/**
 * One row per sign-up week, one column per week since sign-up. Each cell is
 * the share of that week's new accounts still using the app, printed in the
 * cell and shaded on the sequential scale.
 */
export function cohortGrid(host, cohorts) {
  if (!cohorts.length) { host.innerHTML = '<p class="empty">No cohorts to show.</p>'; return; }
  const maxW = Math.max(...cohorts.map(c => c.retained.length));
  const vals = cohorts.flatMap(c => c.retained.slice(1));
  const breaks = quantileBreaks(vals, 5), bin = v => 1 + breaks.filter(b => v > b).length;
  const at = n => { const l = cohorts.filter(c => c.retained.length > n); return l.length ? sum(l.map(c => c.retained[n] * c.size)) / sum(l.map(c => c.size)) : null; };
  const w1 = at(1), w4 = at(4);
  const summary = `Retention by sign-up week. Across cohorts, ${w1 != null ? pct(w1, 0) : 'n/a'} used the app one week after signing up${w4 != null ? ` and ${pct(w4, 0)} four weeks after` : ''}.`;
  host.innerHTML = `<p class="stats"><span>After 1 week <b>${w1 != null ? pct(w1, 0) : 'n/a'}</b></span>${w4 != null ? `<span>After 4 weeks <b>${pct(w4, 0)}</b></span>` : ''}<span>${cohorts.length} weekly cohorts</span></p>
    <div class="tscroll"><table class="cohort"><caption class="sr-only">${escapeHtml(summary)} Rows are sign-up weeks; columns are weeks since sign-up.</caption>
    <thead><tr><th scope="col">Signed up, week of</th><th scope="col" class="num">New accounts</th>${Array.from({ length: maxW - 1 }, (_, i) => `<th scope="col" class="num">Week ${i + 1}</th>`).join('')}</tr></thead>
    <tbody>${cohorts.map(c => `<tr><th scope="row">${dfmt(c.week)}</th><td class="num">${fmt(c.size)}</td>${Array.from({ length: maxW - 1 }, (_, i) => {
      const v = c.retained[i + 1];
      return v == null ? '<td class="co none"></td>' : `<td class="co b${bin(v)}">${pct(v, 0)}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="legend"><span>Fewer came back</span><span class="ramp">${[1, 2, 3, 4, 5].map(b => `<span class="swatch" style="background:var(--seq-${b})"></span>`).join('')}</span><span>More came back</span></div>`;
}

/* ---------- table ---------- */
export function table(host, cols, rows, caption = '') {
  host.innerHTML = `<div class="tscroll"><table>${caption ? `<caption class="sr-only">${escapeHtml(caption)}</caption>` : ''}
    <thead><tr>${cols.map(c => `<th scope="col" class="${c.num ? 'num' : ''}">${c.h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((v, i) => `<td class="${cols[i].num ? 'num' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export const meter = x => `${pct(x)}<span class="meter" aria-hidden="true"><i style="width:${x * 100}%"></i></span>`;

/* ---------- day × hour heat grid ---------- */
const hourLabel = h => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`);

export function heatGrid(host, { days, matrix, valueLabel = 'sessions' }) {
  const flat = matrix.flat(), breaks = quantileBreaks(flat, 5);
  const bin = v => 1 + breaks.filter(b => v > b).length;
  let peak = { v: -1 }, low = { v: Infinity };
  matrix.forEach((row, d) => row.forEach((v, h) => {
    if (v > peak.v) peak = { v, d, h };
    if (v < low.v) low = { v, d, h };
  }));
  const summary = `Busiest hour: ${days[peak.d]} ${hourLabel(peak.h)}, about ${fmt(peak.v)} ${valueLabel}. Quietest: ${days[low.d]} ${hourLabel(low.h)}, about ${fmt(low.v)}.`;
  let cells = '<span></span>';
  for (let h = 0; h < 24; h += 3) cells += `<span class="hh">${hourLabel(h)}</span>`;
  matrix.forEach((row, d) => {
    cells += `<span class="dl">${days[d]}</span>`;
    row.forEach((v, h) => { cells += `<span class="c b${bin(v)}${d === peak.d && h === peak.h ? ' peak' : ''}" data-d="${d}" data-h="${h}"></span>`; });
  });
  host.innerHTML = `<p class="stats"><span>${escapeHtml(summary)}</span></p>
    <div class="chart"><div class="hg" role="img" aria-label="${escapeHtml(summary)}">${cells}</div><div class="tip above" hidden></div></div>
    <div class="legend"><span>Fewer</span><span class="ramp">${[1, 2, 3, 4, 5].map(b => `<span class="swatch" style="background:var(--seq-${b})"></span>`).join('')}</span><span>More ${escapeHtml(valueLabel)}</span><span><span class="swatch peak"></span>Busiest hour</span></div>`;
  const grid = host.querySelector('.hg'), tip = host.querySelector('.tip'), wrap = host.querySelector('.chart');
  grid.addEventListener('pointerover', e => {
    const c = e.target.closest('.c'); if (!c) return;
    const d = +c.dataset.d, h = +c.dataset.h, r = c.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    tip.innerHTML = `<b>${days[d]} ${hourLabel(h)}–${hourLabel((h + 1) % 24)}</b><div>Average ${escapeHtml(valueLabel)}<span>${fmt(matrix[d][h])}</span></div>`;
    tip.hidden = false;
    tip.style.left = clamp(r.left - w.left + r.width / 2, 90, w.width - 90) + 'px';
    tip.style.top = (r.top - w.top) + 'px';
  });
  grid.addEventListener('pointerleave', () => { tip.hidden = true; });
}
