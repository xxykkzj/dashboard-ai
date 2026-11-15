/**
 * Geographic council (LGA) map, drawn with D3 as plain SVG (no basemap).
 *
 * - Real council boundaries: ABS ASGS Edition 3, LGA 2023 (CC BY 4.0),
 *   simplified, in data/reference/sa-lga-2023.topo.json.
 * - Projection: Lambert conformal conic with standard parallels 28°S and 36°S,
 *   the projection commonly used for South Australian state mapping.
 * - Opens on the populated south (Port Lincoln to Mount Gambier). "Whole state"
 *   zooms out to include the outback. Metropolitan Adelaide is shown enlarged
 *   in an inset, and its area is outlined on the main map.
 * - Same contract as tileMap(): rows, metric, threshold, selected, onSelect.
 *
 * Interaction: drag to move, Ctrl/⌘ + scroll or pinch to zoom (mouse and
 * trackpad). On touch screens the buttons do the zooming, so the page still
 * scrolls normally. Keyboard: each map is one Tab stop, arrow keys move between
 * councils, Enter or Space selects. "Show as table" gives the same data as text.
 *
 * Needs the D3 and topojson-client scripts in js/vendor (loaded in index.html).
 */
import { fmt, clamp, escapeHtml, quantileBreaks } from './format.mjs';
import { reduceMotion } from './motion.mjs';

const METRICS = {
  per1000: { label: 'users per 1,000 residents', get: r => r.per1000 },
  users: { label: 'active users', get: r => r.users }
};
const KEYS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

// Corners of the populated south, used for the default view
const POPULATED = { type: 'MultiPoint', coordinates: [[135.3, -32.3], [141.05, -32.3], [135.3, -38.15], [141.05, -38.15]] };

// Reference labels: [name, longitude, latitude, minimum zoom to show it, kind].
// Listed in priority order: when two labels would collide, the earlier one wins.
// 'town' has a dot; 'sea' and 'land' are centred names with no dot.
const TOWNS = [
  ['Port Augusta', 137.77, -32.49, 0, 'town'], ['Port Lincoln', 135.86, -34.72, 0, 'town'], ['Mount Gambier', 140.78, -37.83, 0, 'town'],
  ['Ceduna', 133.68, -32.13, 0, 'town'], ['Coober Pedy', 134.75, -29.01, 0, 'town'], ['Renmark', 140.75, -34.18, 1.4, 'town'],
  ['Murray Bridge', 139.27, -35.12, 1.6, 'town'], ['Whyalla', 137.58, -33.03, 1.6, 'town'], ['Roxby Downs', 136.90, -30.56, 1.2, 'town'],
  ['Spencer Gulf', 136.95, -34.25, 1.6, 'sea'], ['Gulf St Vincent', 138.02, -35.05, 3.2, 'sea'], ['Kangaroo Island', 137.2, -35.82, 1.6, 'land'],
  ['Great Australian Bight', 132.6, -33.6, 0, 'sea'], ['Southern Ocean', 138.2, -36.9, 1.6, 'sea'],
  ['Port Pirie', 138.02, -33.19, 2.2, 'town'], ['Victor Harbor', 138.62, -35.55, 2.6, 'town'], ['Kingscote', 137.64, -35.66, 3.2, 'town']
];
const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

// Large outer metro councils are clear on the main map, so the inset frames the inner suburbs
const OUTER_METRO = new Set(['PLA', 'GAW', 'ONK']);

const featureCache = new WeakMap();
let uid = 0;

function features(topo) {
  if (!featureCache.has(topo)) {
    const obj = topo.objects.lga;
    featureCache.set(topo, {
      all: window.topojson.feature(topo, obj),
      outline: window.topojson.mesh(topo, obj, (a, b) => a === b)
    });
  }
  return featureCache.get(topo);
}

/**
 * Where to put each council's name on the inset: the widest clear spot inside the
 * part of the council that is on screen. Works on a pixel grid, so it copes with
 * the odd shapes that simplified boundaries produce. Cached per boundary file and size.
 */
const spotCache = new WeakMap();
function insetLabelSpots(topo, all, d3, proj, path, W, H) {
  const key = `${W}x${H}`, cache = spotCache.get(topo) || {};
  if (cache[key]) return cache[key];
  const G = 6, cols = Math.floor(W / G), rows = Math.floor(H / G);
  const cand = all.features.map(f => ({ f, b: path.bounds(f) })).filter(({ b }) => b[1][0] > 0 && b[0][0] < W && b[1][1] > 0 && b[0][1] < H);
  const owner = new Int16Array(cols * rows).fill(-1);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = (i + 0.5) * G, y = (j + 0.5) * G, ll = proj.invert([x, y]);
    const k = cand.findIndex(({ f, b }) => x >= b[0][0] && x <= b[1][0] && y >= b[0][1] && y <= b[1][1] && d3.geoContains(f, ll));
    owner[j * cols + i] = k;
  }
  const at = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? -2 : owner[j * cols + i]);
  const best = cand.map(() => null), area = cand.map(() => 0);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = at(i, j); if (k < 0) continue;
    area[k]++;
    if (i > 0 && at(i - 1, j) === k) continue;              // only start a run at its left end
    let i1 = i; while (at(i1 + 1, j) === k) i1++;
    const mid = Math.round((i + i1) / 2);
    let up = 0, down = 0;
    const q = Math.floor((i1 - i) / 4), clear = jj => at(mid, jj) === k && at(mid - q, jj) === k && at(mid + q, jj) === k;
    while (clear(j - up - 1)) up++;
    while (clear(j + down + 1)) down++;
    const run = i1 - i + 1, tall = 1 + 2 * Math.min(up, down), score = Math.min(run, tall * 3) + Math.min(up, down) * 0.01;
    if (!best[k] || score > best[k].score) best[k] = { score, x: (i + i1 + 1) / 2 * G, y: (j + 0.5) * G, w: (run - 1.4) * G, h: tall * G };
  }
  const spots = cand.map(({ f }, k) => best[k] && { code: f.properties.code, area: area[k], ...best[k] }).filter(Boolean);
  cache[key] = spots; spotCache.set(topo, cache);
  return spots;
}

export function geoMap(host, { rows, metric = 'per1000', threshold = 10, selected = null, onSelect, topo }) {
  const d3 = window.d3;
  if (!d3 || !window.topojson || !topo) {
    host.innerHTML = '<p class="err">The map couldn\'t load. Check that js/vendor and data/reference/sa-lga-2023.topo.json are present.</p>';
    return;
  }
  const id = 'gm' + (++uid);
  const refocus = host.contains(document.activeElement) ? document.activeElement.dataset.code : null;
  const m = METRICS[metric] || METRICS.per1000;
  const byCode = new Map(rows.map(r => [r.code, r]));
  const visible = rows.filter(r => !r.suppressed);
  const breaks = quantileBreaks(visible.map(m.get), 5);
  const bin = r => (!r || r.suppressed ? 0 : 1 + breaks.filter(b => m.get(r) > b).length);
  const describe = r => r.suppressed
    ? `${r.name}: fewer than ${threshold} users, hidden for privacy`
    : `${r.name}: ${fmt(m.get(r))} ${m.label}`;
  host._selected = selected || null;

  const ranges = [1, 2, 3, 4, 5].map(b => {
    const lo = b === 1 ? null : breaks[b - 2], hi = b === 5 ? null : breaks[b - 1];
    return lo == null ? `${fmt(hi)} or less` : hi == null ? `More than ${fmt(lo)}` : `${fmt(lo)}–${fmt(hi)}`;
  });

  /* ---------- layout ---------- */
  host.innerHTML = `<div class="gm-wrap">
    <div class="gm">
      <div class="gm-main">
        <div class="gm-tools" role="group" aria-label="Map view">
          <button type="button" data-view="populated">Populated areas</button>
          <button type="button" data-view="state">Whole state</button>
          <button type="button" data-zoom="1.6" aria-label="Zoom in">+</button>
          <button type="button" data-zoom="0.625" aria-label="Zoom out">−</button>
        </div>
      </div>
      <div class="gm-side">
        <p class="tm-cap" id="${id}-met">Inner Adelaide, enlarged <span>(the dashed box on the main map)</span></p>
        <div class="gm-inset"></div>
        <p class="tm-detail" aria-live="polite"></p>
      </div>
    </div>
    <div class="legend" aria-label="Map legend: ${m.label}">
      <span>${m.label[0].toUpperCase() + m.label.slice(1)}:</span>
      ${ranges.map((t, i) => `<span><span class="swatch" style="background:var(--seq-${i + 1})"></span>${t}</span>`).join('')}
      <span><span class="swatch b0"></span>Fewer than ${threshold} users</span>
    </div>
    <p class="gm-hint">Drag to move the map. Ctrl + scroll, pinch or the buttons zoom. Boundaries are simplified from ABS ASGS Edition 3, LGA 2023 (CC BY 4.0).</p>
    <button type="button" class="linkbtn" aria-expanded="false">Show as table</button>
    <div class="tm-table" hidden></div>
    <div class="tip above" hidden></div>
  </div>`;

  const wrap = host.querySelector('.gm-wrap'), tip = host.querySelector('.tip');
  const mainBox = host.querySelector('.gm-main'), insetBox = host.querySelector('.gm-inset');
  const detail = host.querySelector('.tm-detail');
  const { all, outline } = features(topo);
  const metroCodes = new Set(rows.filter(r => r.group === 'metro' && !OUTER_METRO.has(r.code)).map(r => r.code));
  const metroFC = { type: 'FeatureCollection', features: all.features.filter(f => metroCodes.has(f.properties.code)) };

  const hatch = `<defs><pattern id="${id}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" class="gm-h-bg"/><line x1="0" y1="0" x2="0" y2="6" class="gm-h-ln"/></pattern></defs>`;
  const fillStyle = r => (bin(r) === 0 ? ` style="fill:url(#${id}-hatch)"` : '');
  const pathEl = (f, path, focusable) => {
    const code = f.properties.code, r = byCode.get(code);
    if (!r) return '';
    const sel = selected === code;
    return `<path class="lga b${bin(r)}${sel ? ' sel' : ''}" d="${path(f)}" data-code="${code}"${fillStyle(r)}${focusable
      ? ` tabindex="-1" role="button" aria-pressed="${sel}" aria-label="${escapeHtml(describe(r))}"`
      : ' aria-hidden="true"'}/>`;
  };

  /* ---------- main map ---------- */
  const W = Math.max(280, Math.round(mainBox.clientWidth || 560));
  const H = Math.round(W * 1.02);
  const proj = d3.geoConicConformal().parallels([-28, -36]).rotate([-135, 0]).fitExtent([[10, 10], [W - 10, H - 10]], all);
  const path = d3.geoPath(proj);
  const [[mx0, my0], [mx1, my1]] = d3.geoBounds(metroFC);
  const box = [proj([mx0, my1]), proj([mx1, my0])];   // top-left, bottom-right in screen space

  const mainPaths = all.features.map(f => pathEl(f, path, !metroCodes.has(f.properties.code))).join('');
  mainBox.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Map of South Australian council areas. Metropolitan councils are in the enlarged map.">
    ${hatch}
    <g class="gm-zoom">
      <g class="gm-lgas">${mainPaths}</g>
      <path class="gm-outline" d="${path(outline)}"/>
      <rect class="gm-insetbox" x="${box[0][0] - 2}" y="${box[0][1] - 2}" width="${box[1][0] - box[0][0] + 4}" height="${box[1][1] - box[0][1] + 4}"/>
      <path class="gm-ring halo" d=""/><path class="gm-ring" d=""/>
    </g>
    <g class="gm-labels" aria-hidden="true"><text class="gm-boxlabel" y="4">Adelaide</text>${TOWNS.map(([n, , , , kind]) =>
      `<g class="gm-${kind}">${kind === 'town' ? '<circle r="2.5"/>' : ''}<text y="4">${n}</text></g>`).join('')}</g>
  </svg>`);
  const svg = mainBox.querySelector('svg'), zoomG = svg.querySelector('.gm-zoom');
  const labelEls = [...svg.querySelectorAll('.gm-labels > g')], boxLabel = svg.querySelector('.gm-boxlabel');
  const townXY = TOWNS.map(([, lng, lat]) => proj([lng, lat]));

  // Transform that frames the populated south
  const frame = geom => {
    const [[x0, y0], [x1, y1]] = path.bounds(geom);
    const k = Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.94;
    return d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k);
  };
  const VIEWS = { populated: frame(POPULATED), state: d3.zoomIdentity };

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const zoom = d3.zoom()
    .scaleExtent([1, 18])
    .translateExtent([[-W * 0.1, -H * 0.1], [W * 1.1, H * 1.1]])
    .filter(e => (e.type === 'wheel' ? (e.ctrlKey || e.metaKey) : !e.button) && !(coarse && e.type.startsWith('touch')))
    .touchable(() => !coarse)
    .on('zoom', e => {
      const t = e.transform;
      zoomG.setAttribute('transform', t.toString());
      // The dashed box is named "Adelaide"; other labels keep clear of it and of each other.
      const b0 = t.apply(box[0]), b1 = t.apply(box[1]);
      const placed = [[b0[0] - 4, b0[1] - 4, b1[0] + 4, b1[1] + 4]];
      const inside = r => r[0] > 4 && r[2] < W - 4 && r[1] > 4 && r[3] < H - 4;
      const boxWide = b1[0] - b0[0] > 150;                       // zoomed in far enough that the box needs no name
      const bl = [b1[0] + 8, (b0[1] + b1[1]) / 2 - 9, b1[0] + 8 + 54, (b0[1] + b1[1]) / 2 + 6];
      const blShow = !boxWide && inside(bl);
      boxLabel.style.display = blShow ? '' : 'none';
      boxLabel.setAttribute('transform', `translate(${bl[0].toFixed(1)},${(bl[1] + 9).toFixed(1)})`);
      if (blShow) placed.push(bl);
      labelEls.forEach((g, i) => {
        const [name, , , minK, kind] = TOWNS[i], [x, y] = t.apply(townXY[i]), w = name.length * 6.3;
        const options = kind === 'town'
          ? [['start', 6, [x - 4, y - 9, x + 8 + w, y + 6]], ['end', -6, [x - 8 - w, y - 9, x + 4, y + 6]]]
          : [['middle', 0, [x - w / 2, y - 9, x + w / 2, y + 6]]];
        const fit = t.k >= minK && options.find(([, , r]) => inside(r) && !placed.some(p => overlap(p, r)));
        g.style.display = fit ? '' : 'none';
        if (!fit) return;
        placed.push(fit[2]);
        g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
        const text = g.querySelector('text');
        text.setAttribute('text-anchor', fit[0]); text.setAttribute('x', fit[1]);
      });
      host._view = { k: t.k, x: t.x / W, y: t.y / H };
      host.querySelectorAll('[data-view]').forEach(b => {
        const v = VIEWS[b.dataset.view];
        b.setAttribute('aria-pressed', String(Math.abs(v.k - t.k) < 0.01 && Math.abs(v.x - t.x) < 1 && Math.abs(v.y - t.y) < 1));
      });
    });
  const sel = d3.select(svg).call(zoom).on('dblclick.zoom', null);
  svg.style.touchAction = coarse ? 'pan-y' : 'none';
  const start = host._view ? d3.zoomIdentity.translate(host._view.x * W, host._view.y * H).scale(host._view.k) : VIEWS.populated;
  sel.call(zoom.transform, start);
  const go = (fn) => (reduceMotion() ? fn(sel) : fn(sel.transition().duration(650)));
  host.querySelector('.gm-tools').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.view) go(s => s.call(zoom.transform, VIEWS[b.dataset.view]));
    if (b.dataset.zoom) go(s => s.call(zoom.scaleBy, +b.dataset.zoom));
  });

  /* ---------- metropolitan inset ---------- */
  const Wi = Math.max(220, Math.round(insetBox.clientWidth || 300));
  const Hi = Math.round(Wi * 1.2);
  const projI = d3.geoConicConformal().parallels([-28, -36]).rotate([-135, 0]).fitExtent([[8, 8], [Wi - 8, Hi - 8]], metroFC);
  const pathI = d3.geoPath(projI);
  // Inner councils are focusable here; neighbours are drawn for context and stay clickable
  const insetPaths = all.features.map(f => pathEl(f, pathI, metroCodes.has(f.properties.code))).join('');

  // Name each council that is big enough: full name, then two lines, then its code.
  // The simplified boundaries are hard to recognise by shape alone, so the names do the work.
  const CH = 5.9, LH = 12;
  const insetLabels = insetLabelSpots(topo, all, d3, projI, pathI, Wi, Hi).map(spot => {
    const r = byCode.get(spot.code); if (!r) return null;
    const words = r.name.split(' ');
    let two = null;
    for (let k = 1; k < words.length; k++) {
      const pair = [words.slice(0, k).join(' '), words.slice(k).join(' ')], w = Math.max(pair[0].length, pair[1].length);
      if (!two || w < two.w) two = { w, lines: pair };
    }
    const lines = r.name.length * CH <= spot.w ? [r.name]
      : two && two.w * CH <= spot.w && spot.h >= LH * 2 + 2 ? two.lines
      : r.code.length * CH + 2 <= spot.w ? [r.code] : null;
    return lines && { r, lines, x: spot.x, y: spot.y, area: spot.area };
  }).filter(Boolean).sort((p, q) => q.area - p.area).reduce((kept, l) => {
    // biggest councils first; a label that would touch one already placed is left out
    const w = Math.max(...l.lines.map(t => t.length)) * CH + 4, h = l.lines.length * LH;
    l.box = [l.x - w / 2, l.y - h / 2, l.x + w / 2, l.y + h / 2];
    if (!kept.some(k => overlap(k.box, l.box))) kept.push(l);
    return kept;
  }, []).map(l => {
    const b = bin(l.r), y = l.y - (l.lines.length - 1) * LH / 2 + 4;
    return `<text class="gm-il${b >= 4 ? ' hi' : ''}${b === 0 ? ' halo' : ''}" text-anchor="middle">${l.lines.map((t, k) => `<tspan x="${l.x.toFixed(1)}" y="${(y + k * LH).toFixed(1)}">${escapeHtml(t)}</tspan>`).join('')}</text>`;
  }).join('');
  const gulf = projI([138.36, -34.9]);

  insetBox.innerHTML = `<svg viewBox="0 0 ${Wi} ${Hi}" role="group" aria-labelledby="${id}-met">${hatch.replace(`${id}-hatch`, `${id}-hatch-i`)}
    <g>${insetPaths.replaceAll(`url(#${id}-hatch)`, `url(#${id}-hatch-i)`)}</g>
    <path class="gm-ring halo" d=""/><path class="gm-ring" d=""/>
    <g class="gm-labels" aria-hidden="true">${insetLabels}
      ${gulf[0] > 30 && gulf[0] < Wi - 30 ? `<g class="gm-sea" transform="translate(${Math.max(34, Math.min(gulf[0], 44)).toFixed(1)},${gulf[1].toFixed(1)})"><text text-anchor="middle" y="-6">Gulf</text><text text-anchor="middle" y="7">St Vincent</text></g>` : ''}</g></svg>`;

  /* ---------- tooltip, selection, keyboard ---------- */
  const detailFor = r => r.suppressed
    ? `<b>${escapeHtml(r.name)}</b>, ${escapeHtml(r.region)}<br>Fewer than ${threshold} users in this period, so the figure is hidden.`
    : `<b>${escapeHtml(r.name)}</b>, ${escapeHtml(r.region)}<br>${fmt(r.users)} active users, ${fmt(r.per1000)} per 1,000 residents`;
  const showDetail = () => {
    const r = byCode.get(host._selected);
    detail.innerHTML = r ? detailFor(r) : 'Select a council area to see its profile. Arrow keys move between areas.';
  };
  showDetail();

  const showTip = (el, cx, cy) => {
    const r = byCode.get(el.dataset.code); if (!r) return;
    const w = wrap.getBoundingClientRect();
    let x = cx, y = cy;
    if (x == null) { const a = el.getBoundingClientRect(); x = a.left + a.width / 2; y = a.top + a.height / 2; }
    tip.innerHTML = `<b>${escapeHtml(r.name)}</b>` + (r.suppressed
      ? `<div>Fewer than ${threshold} users</div>`
      : `<div>Per 1,000 residents<span>${fmt(r.per1000)}</span></div><div>Active users<span>${fmt(r.users)}</span></div>`);
    tip.hidden = false;
    tip.style.left = clamp(x - w.left, 90, w.width - 90) + 'px';
    tip.style.top = (y - w.top - 8) + 'px';
  };
  const hideTip = () => { tip.hidden = true; };

  const select = code => {
    const active = document.activeElement;
    host._selected = host._selected === code ? null : code;
    host.querySelectorAll('path.lga[data-code]').forEach(p => {
      const on = p.dataset.code === host._selected;
      p.classList.toggle('sel', on);
      if (p.hasAttribute('aria-pressed')) p.setAttribute('aria-pressed', String(on));
      if (on) p.parentNode.appendChild(p);   // draw the selected outline on top
    });
    // moving a path to the top drops keyboard focus, so put it back before anything re-draws
    if (active && host.contains(active) && document.activeElement !== active) active.focus();
    showDetail();
    if (onSelect) onSelect(host._selected);
  };

  const ensureVisible = p => {
    if (!svg.contains(p)) return;
    const t = d3.zoomTransform(svg), [x, y] = t.apply(path.centroid(all.features.find(f => f.properties.code === p.dataset.code)));
    if (x < 20 || x > W - 20 || y < 20 || y > H - 20) go(s => s.call(zoom.translateTo, ...t.invert([x, y])));
  };

  [svg, insetBox.querySelector('svg')].forEach(s => {
    const focusables = [...s.querySelectorAll('path.lga[tabindex]')];
    if (!focusables.length) return;
    const pr = s === svg ? path : pathI;
    const centre = new Map(focusables.map(p => [p, pr.centroid(all.features.find(f => f.properties.code === p.dataset.code))]));
    (focusables.find(p => p.dataset.code === selected) || focusables[0]).tabIndex = 0;

    s.addEventListener('pointermove', e => { const p = e.target.closest('path.lga[data-code]'); if (p) showTip(p, e.clientX, e.clientY); else hideTip(); });
    s.addEventListener('pointerleave', hideTip);
    // Keyboard focus is drawn as a ring above every council, so it is never hidden by a neighbour
    const rings = [...s.querySelectorAll('.gm-ring')];
    const ring = p => rings.forEach(r => r.setAttribute('d', p && p.matches(':focus-visible') ? p.getAttribute('d') : ''));
    s.addEventListener('focusin', e => { const p = e.target.closest('path.lga[data-code]'); if (p) { ensureVisible(p); showTip(p); ring(p); } });
    s.addEventListener('focusout', () => { hideTip(); ring(null); });
    s.addEventListener('click', e => {
      if (e.defaultPrevented) return;
      const p = e.target.closest('path.lga[data-code]'); if (p) select(p.dataset.code);
    });
    s.addEventListener('keydown', e => {
      const p = e.target.closest('path.lga[tabindex]'); if (!p) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p.dataset.code); return; }
      const dir = KEYS[e.key]; if (!dir) return;
      e.preventDefault();
      const [cx, cy] = centre.get(p);
      let best = null, bestScore = Infinity;
      focusables.forEach(q => {
        if (q === p) return;
        const [x, y] = centre.get(q), dx = x - cx, dy = y - cy;
        const along = dx * dir[0] + dy * dir[1];
        if (along <= 0) return;
        const score = along + 2 * (Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]));
        if (score < bestScore) { bestScore = score; best = q; }
      });
      if (best) { p.tabIndex = -1; best.tabIndex = 0; best.focus(); }
    });
  });

  if (host._selected) {
    host.querySelectorAll(`path.lga.sel`).forEach(p => p.parentNode.appendChild(p));
  }
  if (refocus) {
    const p = host.querySelector(`path.lga[tabindex][data-code="${refocus}"]`);
    if (p) { p.closest('svg').querySelectorAll('path.lga[tabindex]').forEach(q => { q.tabIndex = -1; }); p.tabIndex = 0; p.focus(); }
  }

  /* ---------- table alternative ---------- */
  const sorted = [...rows].sort((a, b) => (b.per1000 ?? -1) - (a.per1000 ?? -1));
  const toggle = host.querySelector('.linkbtn'), tbl = host.querySelector('.tm-table');
  const fillTable = () => {
    if (tbl.innerHTML) return;
    tbl.innerHTML = `<div class="tscroll"><table><caption class="sr-only">Active users by council area</caption>
      <thead><tr><th scope="col">Council area</th><th scope="col">Region</th><th scope="col" class="num">Population</th><th scope="col" class="num">Active users</th><th scope="col" class="num">Per 1,000</th></tr></thead>
      <tbody>${sorted.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.region)}</td><td class="num">${fmt(r.population)}</td>
        <td class="num">${r.suppressed ? `&lt;${threshold}` : fmt(r.users)}</td><td class="num">${r.suppressed ? '–' : fmt(r.per1000)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  if (host._table) { fillTable(); tbl.hidden = false; toggle.setAttribute('aria-expanded', 'true'); toggle.textContent = 'Hide table'; }
  toggle.addEventListener('click', () => {
    const open = tbl.hidden;
    if (open) fillTable();
    host._table = open;
    tbl.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide table' : 'Show as table';
  });
}
