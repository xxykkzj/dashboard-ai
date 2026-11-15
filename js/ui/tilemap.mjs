/**
 * Council (LGA) tile map.
 *
 * Each council is one equal-sized tile placed roughly where it sits in South
 * Australia, with metropolitan Adelaide drawn as an inset. Equal tiles stop
 * the huge outback councils from dominating and keep small metro councils
 * visible, and the layout never needs raw coordinates.
 *
 * Selecting a tile calls onSelect(code), which the Location tab uses to
 * fill the council profile next to the map.
 *
 * Accessibility: each grid is one Tab stop; arrow keys move between tiles,
 * Enter or Space selects a tile, and "Show as table" gives the same data as text.
 */
import { fmt, pct, clamp, escapeHtml, quantileBreaks } from './format.mjs';

const METRICS = {
  per1000: { label: 'users per 1,000 residents', get: r => r.per1000 },
  users: { label: 'active users', get: r => r.users }
};
const KEYS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

let uid = 0;

export function tileMap(host, { rows, metric = 'per1000', threshold = 10, placeholder = { col: 9, row: 11 }, selected = null, onSelect }) {
  const id = 'tm' + (++uid);
  const refocus = host.contains(document.activeElement) ? document.activeElement.dataset.code : null;
  const m = METRICS[metric] || METRICS.per1000;
  const visible = rows.filter(r => !r.suppressed);
  const breaks = quantileBreaks(visible.map(m.get), 5);
  const bin = r => (r.suppressed ? 0 : 1 + breaks.filter(b => m.get(r) > b).length);
  const describe = r => r.suppressed
    ? `${r.name}: fewer than ${threshold} users, hidden for privacy`
    : `${r.name}: ${fmt(m.get(r))} ${m.label}`;
  host._selected = selected || null;

  const tile = r => `<button type="button" class="tile b${bin(r)}" tabindex="-1"
      style="grid-column:${r.tile.col + 1};grid-row:${r.tile.row + 1}"
      data-code="${r.code}" data-col="${r.tile.col}" data-row="${r.tile.row}"
      aria-pressed="${selected === r.code}" aria-label="${escapeHtml(describe(r))}">${r.code}</button>`;
  const dims = list => ({
    cols: Math.max(...list.map(r => r.tile.col)) + 1,
    rows: Math.max(...list.map(r => r.tile.row)) + 1
  });
  const regional = rows.filter(r => r.group !== 'metro'), metro = rows.filter(r => r.group === 'metro');
  const dr = dims(regional), dm = dims(metro);

  const fmtBreak = v => fmt(v);
  const ranges = [1, 2, 3, 4, 5].map(b => {
    const lo = b === 1 ? null : breaks[b - 2], hi = b === 5 ? null : breaks[b - 1];
    return lo == null ? `${fmtBreak(hi)} or less` : hi == null ? `More than ${fmtBreak(lo)}` : `${fmtBreak(lo)}–${fmtBreak(hi)}`;
  });
  const sorted = [...rows].sort((a, b) => (b.per1000 ?? -1) - (a.per1000 ?? -1));

  host.innerHTML = `<div class="tm-wrap">
    <div class="tm">
      <div>
        <p class="tm-cap" id="${id}-reg">Regional South Australia</p>
        <div class="tm-grid" role="group" aria-labelledby="${id}-reg" style="--cols:${dr.cols}">
          ${regional.map(tile).join('')}
          <span class="tile ph" aria-hidden="true" title="Metropolitan Adelaide, shown in the inset" style="grid-column:${placeholder.col + 1};grid-row:${placeholder.row + 1}">ADL</span>
        </div>
      </div>
      <div class="tm-metro">
        <p class="tm-cap" id="${id}-met">Metropolitan Adelaide <span>(ADL on the main map)</span></p>
        <div class="tm-grid" role="group" aria-labelledby="${id}-met" style="--cols:${dm.cols}">${metro.map(tile).join('')}</div>
        <p class="tm-detail" aria-live="polite"></p>
      </div>
    </div>
    <div class="legend" aria-label="Map legend: ${m.label}">
      <span>${m.label[0].toUpperCase() + m.label.slice(1)}:</span>
      ${ranges.map((t, i) => `<span><span class="swatch" style="background:var(--seq-${i + 1})"></span>${t}</span>`).join('')}
      <span><span class="swatch b0"></span>Fewer than ${threshold} users</span>
    </div>
    <button type="button" class="linkbtn" aria-expanded="false">Show as table</button>
    <div class="tm-table" hidden></div>
    <div class="tip above" hidden></div>
  </div>`;

  const wrap = host.querySelector('.tm-wrap'), tip = host.querySelector('.tip');
  const detail = host.querySelector('.tm-detail');
  const byCode = new Map(rows.map(r => [r.code, r]));

  const detailFor = r => r.suppressed
    ? `<b>${escapeHtml(r.name)}</b>, ${escapeHtml(r.region)}<br>Fewer than ${threshold} users in this period, so the figure is hidden.`
    : `<b>${escapeHtml(r.name)}</b>, ${escapeHtml(r.region)}<br>${fmt(r.users)} active users, ${fmt(r.per1000)} per 1,000 residents`;
  const showDetail = () => {
    const r = byCode.get(host._selected);
    detail.innerHTML = r ? detailFor(r) : 'Select a council area to see its profile. Arrow keys move between areas.';
  };
  showDetail();

  const showTip = el => {
    const r = byCode.get(el.dataset.code), a = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    tip.innerHTML = `<b>${escapeHtml(r.name)}</b>` + (r.suppressed
      ? `<div>Fewer than ${threshold} users</div>`
      : `<div>Per 1,000 residents<span>${fmt(r.per1000)}</span></div><div>Active users<span>${fmt(r.users)}</span></div>`);
    tip.hidden = false;
    tip.style.left = clamp(a.left - w.left + a.width / 2, 90, w.width - 90) + 'px';
    tip.style.top = (a.top - w.top) + 'px';
  };
  const hideTip = () => { tip.hidden = true; };

  host.querySelectorAll('.tm-grid').forEach(grid => {
    const tiles = [...grid.querySelectorAll('button.tile')];
    (tiles.find(t => t.dataset.code === selected) || tiles[0]).tabIndex = 0;

    grid.addEventListener('pointerover', e => { const t = e.target.closest('button.tile'); if (t) showTip(t); });
    grid.addEventListener('pointerleave', hideTip);
    grid.addEventListener('focusin', e => { const t = e.target.closest('button.tile'); if (t) showTip(t); });
    grid.addEventListener('focusout', hideTip);

    grid.addEventListener('click', e => {
      const t = e.target.closest('button.tile'); if (!t) return;
      host._selected = host._selected === t.dataset.code ? null : t.dataset.code;
      host.querySelectorAll('button.tile').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.code === host._selected)));
      showDetail();
      if (onSelect) onSelect(host._selected);
    });

    grid.addEventListener('keydown', e => {
      const dir = KEYS[e.key]; if (!dir) return;
      const cur = e.target.closest('button.tile'); if (!cur) return;
      e.preventDefault();
      const cc = +cur.dataset.col, cr = +cur.dataset.row;
      let best = null, bestScore = Infinity;
      tiles.forEach(t => {
        const dc = +t.dataset.col - cc, drow = +t.dataset.row - cr;
        const along = dc * dir[0] + drow * dir[1];
        if (along <= 0) return;
        const score = along + 2 * (Math.abs(dc * dir[1]) + Math.abs(drow * dir[0]));
        if (score < bestScore) { bestScore = score; best = t; }
      });
      if (best) { cur.tabIndex = -1; best.tabIndex = 0; best.focus(); }
    });
  });

  if (refocus) {
    const t = host.querySelector(`button.tile[data-code="${refocus}"]`);
    if (t) { host.querySelectorAll('button.tile').forEach(b => { if (b.closest('.tm-grid') === t.closest('.tm-grid')) b.tabIndex = -1; }); t.tabIndex = 0; t.focus(); }
  }

  const toggle = host.querySelector('.linkbtn'), tbl = host.querySelector('.tm-table');
  if (host._table) { tbl.hidden = false; toggle.setAttribute('aria-expanded', 'true'); toggle.textContent = 'Hide table'; }
  const fillTable = () => {
    if (!tbl.innerHTML) {
      tbl.innerHTML = `<div class="tscroll"><table><caption class="sr-only">Active users by council area</caption>
        <thead><tr><th scope="col">Council area</th><th scope="col">Region</th><th scope="col" class="num">Population</th><th scope="col" class="num">Active users</th><th scope="col" class="num">Per 1,000</th></tr></thead>
        <tbody>${sorted.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.region)}</td><td class="num">${fmt(r.population)}</td>
          <td class="num">${r.suppressed ? `&lt;${threshold}` : fmt(r.users)}</td><td class="num">${r.suppressed ? '–' : fmt(r.per1000)}</td></tr>`).join('')}</tbody></table></div>`;
    }
  };
  if (host._table) fillTable();
  toggle.addEventListener('click', () => {
    const open = tbl.hidden;
    if (open) fillTable();
    host._table = open;
    tbl.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide table' : 'Show as table';
  });
}
